/**
 * RingCatch — multi-tenant call engine (generalized Slice 2.5 + 3)
 * -----------------------------------------------------------------
 * Fluid, INTERRUPTIBLE phone conversation via Twilio ConversationRelay, for
 * ANY business configured in the tenants table (see ringcatch-studio's wizard).
 *
 * One deployed process serves every tenant: the dialed number tells us which
 * tenant answered, and lib/brain.js compiles that tenant's fields + industry
 * template into the system prompt. Nothing here is business-specific anymore.
 *
 * Twilio setup per tenant: point their number's Voice webhook at POST /voice.
 * ConversationRelay needs a PUBLIC wss URL — set PUBLIC_URL (https://…) and we
 * derive wss://…/relay.
 */

require("dotenv").config();
const http = require("http");
const express = require("express");
const twilio = require("twilio");
const { WebSocketServer } = require("ws");
const { getAvailableSlots, bookSlot, textLink } = require("./calendar");
const { getTenantByPhoneNumber, getTenantById, createCallLog, finishCallLog, createBooking } = require("./lib/tenants");
const { buildSystemPrompt, greetingFor } = require("./lib/brain");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  LLM_BASE_URL,
  LLM_MODEL,
  LLM_API_KEY,
  ANTHROPIC_API_KEY,
  PUBLIC_URL,
  RELAY_WSS_URL, // optional explicit override, e.g. wss://host/relay
  PORT,
} = process.env;

const VOICE = process.env.TTS_VOICE || "en-US-Neural2-D"; // ConversationRelay TTS voice
const MAX_TURNS = 14;

const app = express();
app.use(express.urlencoded({ extended: false }));
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ---- 1) Inbound call: look up the tenant, hand off to ConversationRelay ----
function relayWssBase() {
  if (RELAY_WSS_URL) return RELAY_WSS_URL.replace(/\/relay.*$/, "");
  if (PUBLIC_URL) return PUBLIC_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return "wss://example.invalid"; // must be set in prod; fine for local ws tests
}

app.post("/voice", async (req, res) => {
  const dialedNumber = req.body.To;
  const tenant = await getTenantByPhoneNumber(dialedNumber);

  if (!tenant) {
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response><Say>This number is not set up yet. Goodbye.</Say><Hangup/></Response>`;
    return res.type("text/xml").send(twiml);
  }

  const greeting = greetingFor(tenant);
  const relayUrl = `${relayWssBase()}/relay?tenantId=${encodeURIComponent(tenant.id)}`;
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Connect>` +
    `<ConversationRelay url="${escapeXml(relayUrl)}" voice="${VOICE}" ` +
    `welcomeGreeting="${escapeXml(greeting)}" interruptible="true" />` +
    `</Connect></Response>`;
  res.type("text/xml").send(twiml);
});

app.get("/", (_req, res) => res.send("RingCatch multi-tenant call engine is running."));

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// ---- 2) The WebSocket brain (ConversationRelay protocol) -------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/relay" });

wss.on("connection", async (ws, req) => {
  const tenantId = new URL(req.url, "http://internal").searchParams.get("tenantId");
  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    ws.close();
    return;
  }

  const state = {
    tenant,
    caller: null,
    callLogId: null,
    messages: [],
    slots: tenant.booking_enabled ? getAvailableSlots(new Date(), 3) : [],
    turns: 0,
    gen: 0, // bumped on barge-in to abort in-flight token streaming
    booked: false,
    ended: false,
  };
  state.messages.push({ role: "system", content: buildSystemPrompt(tenant, state.slots) });

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "setup":
        state.caller = msg.from || "unknown";
        state.callLogId = (await createCallLog(tenant.id, state.caller))?.id || null;
        // Twilio speaks welcomeGreeting itself; seed it so the model has context.
        state.messages.push({ role: "assistant", content: greetingFor(tenant) });
        break;

      case "prompt": // a completed caller utterance (transcribed)
        await handleUtterance(ws, state, (msg.voicePrompt || "").trim());
        break;

      case "interrupt": // caller talked over the AI — stop the current reply
        state.gen++;
        break;

      case "error":
        console.error("ConversationRelay error:", msg.description || msg);
        break;
    }
  });

  ws.on("close", () => endCall(state)); // caller hung up -> summarize + notify owner
});

async function handleUtterance(ws, state, heard) {
  if (!heard) return;
  state.messages.push({ role: "user", content: heard });
  state.turns++;
  const gen = ++state.gen; // this reply's generation; barge-in bumps state.gen

  // Stream the reply token-by-token to Twilio, filtering control tokens.
  let spokeAnything = false;
  const filter = makeSpeechFilter((chunk) => {
    if (state.gen !== gen) return;
    if (chunk.trim()) spokeAnything = true;
    ws.send(JSON.stringify({ type: "text", token: chunk, last: false }));
  });

  const full = await streamChat(state.messages, (delta) => filter.push(delta), () => state.gen === gen);
  if (state.gen !== gen) return; // superseded by a barge-in; drop this reply

  filter.flush(); // speak any held-back tail
  // Never leave dead air — if the model returned nothing speakable, say something.
  if (!spokeAnything) {
    ws.send(JSON.stringify({ type: "text", token: "Sorry, could you say that again?", last: false }));
  }
  ws.send(JSON.stringify({ type: "text", token: "", last: true })); // end this TTS turn
  state.messages.push({ role: "assistant", content: full || "" });

  // Act on control tokens found in the full text.
  const bookMatch = full.match(/\[\[\s*BOOK\s*(\d+)\s*\]\]/i);
  if (bookMatch && !state.booked) await doBooking(state, parseInt(bookMatch[1], 10));

  const done = /\[\[\s*END\s*\]\]/i.test(full) || state.turns >= MAX_TURNS;
  if (done) {
    ws.send(JSON.stringify({ type: "end" })); // ask Twilio to hang up
    endCall(state);
  }
}

// ---- Booking (Slice 3) -----------------------------------------------------
async function doBooking(state, slotId) {
  const { tenant } = state;
  const slot = state.slots.find((s) => s.id === slotId) || state.slots[0];
  if (!slot) return;
  const details = await extractDetails(state.messages, state.caller);

  const result = await bookSlot(slot, details);
  state.booked = result.ok;
  state.bookedSlot = result.ok ? slot : null;

  if (result.ok) {
    await createBooking(tenant.id, state.callLogId, details, slot);
    // Confirm to the caller (their number is known from setup) and notify owner.
    safeSms(tenant, state.caller, `${tenant.business_name}: you're booked for ${slot.label}. We'll see you then! Reply here if anything changes.`);
    notifyOwner(tenant, `✅ New booking — ${tenant.business_name}\n${slot.label}\n${details.name || "?"} · ${details.phone || state.caller}\n${details.job || ""}\n${details.address || ""}`);
  } else {
    console.error("Booking failed:", result.error);
    // Safety net: text a self-serve scheduling link instead.
    textLink(client, state.caller, tenant.phone_number, tenant.business_name);
  }
}

// Best-effort structured extraction for the calendar event + confirmations.
async function extractDetails(messages, callerNumber) {
  const transcript = messages.filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Caller" : "Reception"}: ${m.content}`).join("\n");
  const prompt =
    `From this call, extract JSON with keys name, phone, job, address (strings; "" if unknown). ` +
    `Reply with ONLY the JSON.\n\n${transcript}`;
  const raw = await chat([{ role: "user", content: prompt }], 150);
  let d = {};
  try { d = JSON.parse((raw || "").replace(/```json|```/g, "").trim()); } catch { /* keep {} */ }
  if (!d.phone) d.phone = callerNumber; // caller's real number is the reliable fallback
  return d;
}

// ---- End of call: summarize, persist, and notify the owner -----------------
async function endCall(state) {
  if (!state || state.ended) return;
  state.ended = true;
  const { tenant } = state;

  // Safety net: if no exact slot got locked in, text the caller a self-serve
  // scheduling link (no-ops unless BOOKING_LINK is set). Rosie's "text a link".
  if (!state.booked) textLink(client, state.caller, tenant.phone_number, tenant.business_name);

  const transcript = state.messages.filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Caller" : "Reception"}: ${m.content}`).join("\n");
  const summary = await summarizeConversation(tenant, state.messages);
  await finishCallLog(state.callLogId, { transcript, summary, booked: state.booked });

  const header = state.booked
    ? `📞 Call + booking (${state.bookedSlot?.label}) — ${tenant.business_name}`
    : `📞 New call — ${tenant.business_name}`;
  notifyOwner(tenant, `${header}\nFrom: ${state.caller}\n\n${summary}`);
}

async function summarizeConversation(tenant, messages) {
  const transcript = messages.filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Caller" : "Reception"}: ${m.content}`).join("\n");
  const prompt =
    `Summarize this call for the owner of ${tenant.business_name} in 3–4 terse lines: name, callback number, ` +
    `what they need, address, urgency, and whether an appointment was booked. Say "not given" for anything missing.` +
    `\n\n${transcript}`;
  return (await chat([{ role: "user", content: prompt }], 220)) || transcript;
}

function notifyOwner(tenant, body) {
  if (tenant.notification_channels?.sms !== false) safeSms(tenant, tenant.owner_phone, body);
}

function safeSms(tenant, to, body) {
  if (!to || !tenant.phone_number) return;
  client.messages.create({ to, from: tenant.phone_number, body })
    .catch((e) => console.error("SMS failed:", e.message));
}

// ---- Streaming filter: speak text, swallow [[BOOK n]] / [[END]] / emoji -----
function makeSpeechFilter(emit) {
  let buffer = ""; // holds text that might contain a partial control token
  const clean = (s) =>
    s.replace(/\[\[\s*(?:END|BOOK[^\]]*)\s*\]\]/gi, "")
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "")
      .replace(/[*_`#>]/g, "");
  return {
    push(delta) {
      buffer += delta;
      // Hold back from the last unclosed "[[" so we never speak a partial token.
      const open = buffer.lastIndexOf("[[");
      const close = buffer.lastIndexOf("]]");
      const safeEnd = open > close ? open : buffer.length;
      const out = clean(buffer.slice(0, safeEnd));
      if (out) emit(out);
      buffer = buffer.slice(safeEnd);
    },
    flush() {
      const out = clean(buffer);
      if (out) emit(out);
      buffer = "";
    },
  };
}

// ---- LLM: streaming (OpenAI-compatible SSE) --------------------------------
async function streamChat(messages, onToken, keepGoing) {
  if (!LLM_BASE_URL) {
    const one = await chat(messages, 200); // non-stream fallback (e.g. Anthropic)
    if (one && onToken) onToken(one);
    return one || "";
  }
  try {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${LLM_API_KEY || "local"}` },
      body: JSON.stringify({ model: LLM_MODEL || "big-pickle", max_tokens: 200, stream: true, messages }),
    });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = "", full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") return full;
        try {
          const j = JSON.parse(payload);
          const delta = j.choices?.[0]?.delta?.content || "";
          if (delta) { full += delta; if (onToken) onToken(delta); }
        } catch { /* ignore keep-alives / partial */ }
        if (keepGoing && !keepGoing()) return full; // barge-in: stop early
      }
    }
    return full;
  } catch (e) {
    console.error("streamChat failed:", e.message);
    return "";
  }
}

// ---- LLM: single non-streaming call (used for extraction/summary) ----------
async function chat(messages, maxTokens) {
  const base = LLM_BASE_URL || (ANTHROPIC_API_KEY ? "anthropic" : null);
  if (!base) return null;
  try {
    if (base === "anthropic") {
      const system = messages.find((m) => m.role === "system")?.content;
      const rest = messages.filter((m) => m.role !== "system");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: maxTokens, ...(system ? { system } : {}), messages: rest }),
      });
      const data = await resp.json();
      return data?.content?.[0]?.text?.trim() || null;
    }
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${LLM_API_KEY || "local"}` },
      body: JSON.stringify({ model: LLM_MODEL || "big-pickle", max_tokens: maxTokens, stream: false, messages }),
    });
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("chat failed:", e.message);
    return null;
  }
}

if (require.main === module) {
  const port = PORT || 3000;
  server.listen(port, () => console.log(`RingCatch multi-tenant engine listening on :${port} (ws: /relay)`));
}

module.exports = { app, server, wss, summarizeConversation, makeSpeechFilter, getAvailableSlots, doBooking, extractDetails };
