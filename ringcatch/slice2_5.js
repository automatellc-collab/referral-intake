/**
 * RingCatch — Slice 2.5 (+ Slice 3 booking)
 * -----------------------------------------
 * Fluid, INTERRUPTIBLE phone conversation via Twilio ConversationRelay.
 *
 * vs Slice 2 (turn-based <Gather>): here Twilio streams the caller's speech to
 * our WebSocket as it happens, we STREAM the LLM reply back token-by-token for
 * Twilio to speak immediately, and the caller can talk over the AI (barge-in).
 * Twilio still does STT + TTS; we own the "brain" and the booking.
 *
 * Slice 3: the AI offers real appointment windows (calendar.js), books the one
 * the caller picks (mock or Google Calendar), and texts confirmations. A
 * text-a-link SMS is the safety net if no exact slot gets locked in.
 *
 * Twilio setup: point the number's Voice webhook at POST /voice. ConversationRelay
 * needs a PUBLIC wss URL — set PUBLIC_URL (https://…) and we derive wss://…/relay.
 */

require("dotenv").config();
const http = require("http");
const express = require("express");
const twilio = require("twilio");
const { WebSocketServer } = require("ws");
const { getAvailableSlots, bookSlot, textLink } = require("./calendar");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_NUMBER,
  OWNER_PHONE,
  LLM_BASE_URL,
  LLM_MODEL,
  LLM_API_KEY,
  ANTHROPIC_API_KEY,
  PUBLIC_URL,
  RELAY_WSS_URL, // optional explicit override, e.g. wss://host/relay
  PORT,
} = process.env;

const BUSINESS = {
  name: process.env.BUSINESS_NAME || "Rooter Bros Plumbing",
  trade: process.env.BUSINESS_TRADE || "plumbing",
  hours: process.env.BUSINESS_HOURS || "Mon–Sat, 7am to 6pm",
  services:
    process.env.BUSINESS_SERVICES ||
    "leak repair, water heaters, drain cleaning, toilets, faucets, and emergency calls",
  area: process.env.BUSINESS_AREA || "the greater Marietta and Atlanta area",
};

const VOICE = process.env.TTS_VOICE || "en-US-Neural2-D"; // ConversationRelay TTS voice
const MAX_TURNS = 14;

const app = express();
app.use(express.urlencoded({ extended: false }));
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ---- 1) Inbound call: hand the media stream to ConversationRelay ------------
function relayWss() {
  if (RELAY_WSS_URL) return RELAY_WSS_URL;
  if (PUBLIC_URL) return PUBLIC_URL.replace(/^http/, "ws").replace(/\/$/, "") + "/relay";
  return "wss://example.invalid/relay"; // must be set in prod; fine for local ws tests
}

app.post("/voice", (req, res) => {
  const greeting =
    `Thanks for calling ${BUSINESS.name}. The owner's on another job right now, ` +
    `but I can help. What can we do for you?`;
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response><Connect>` +
    `<ConversationRelay url="${relayWss()}" voice="${VOICE}" ` +
    `welcomeGreeting="${escapeXml(greeting)}" interruptible="true" />` +
    `</Connect></Response>`;
  res.type("text/xml").send(twiml);
});

app.get("/", (_req, res) => res.send("RingCatch Slice 2.5 (fluid + booking) is running."));

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
}

// ---- System prompt (brain), now with booking ------------------------------
function buildSystemPrompt(slots) {
  const slotList = slots.map((s) => `${s.id}) ${s.label}`).join("; ");
  return (
    `You are the friendly phone receptionist for ${BUSINESS.name}, a ${BUSINESS.trade} business, ` +
    `answering because the owner couldn't pick up. You are speaking OUT LOUD on a phone call.\n\n` +
    `Goals, in order:\n` +
    `1. Greet, find out what they need.\n` +
    `2. Collect, one question at a time: caller's name, callback number, the job, the address, urgency.\n` +
    `3. Offer to book an appointment from these windows: ${slotList}. ` +
    `Offer them by their words (e.g. "this afternoon, 1 to 3"), not by number.\n` +
    `4. Answer simple questions from the business info below.\n\n` +
    `Style (spoken aloud): one or two SHORT sentences per reply. No lists, no markdown, no emojis. ` +
    `One question at a time. Never invent prices or exact arrival times beyond the windows.\n\n` +
    `Booking: once you have the name AND callback number AND the job, offer the windows. ` +
    `When the caller picks one, confirm it in words and then output [[BOOK n]] at the very end of that ` +
    `message, where n is the window number (1, 2, or 3). Only one [[BOOK]].\n\n` +
    `Ending: after booking (or if they decline a time but you have their details), thank them by name, ` +
    `say the owner will follow up, give a brief goodbye, then output [[END]] at the very end. ` +
    `Never output [[END]] before you have at least the name and callback number.\n\n` +
    `Business info — hours: ${BUSINESS.hours}. Services: ${BUSINESS.services}. Service area: ${BUSINESS.area}.`
  );
}

// ---- 2) The WebSocket brain (ConversationRelay protocol) -------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/relay" });

wss.on("connection", (ws) => {
  const state = {
    caller: null,
    messages: [],
    slots: getAvailableSlots(new Date(), 3),
    turns: 0,
    gen: 0, // bumped on barge-in to abort in-flight token streaming
    booked: false,
    ended: false,
  };
  state.messages.push({ role: "system", content: buildSystemPrompt(state.slots) });

  ws.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "setup":
        state.caller = msg.from || "unknown";
        // Twilio speaks welcomeGreeting itself; seed it so the model has context.
        state.messages.push({
          role: "assistant",
          content: `Thanks for calling ${BUSINESS.name}. The owner's on another job right now, but I can help. What can we do for you?`,
        });
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

  ws.on("close", () => endCall(state)); // caller hung up -> summarize + SMS owner
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
  const slot = state.slots.find((s) => s.id === slotId) || state.slots[0];
  if (!slot) return;
  const details = await extractDetails(state.messages, state.caller);

  const result = await bookSlot(slot, details);
  state.booked = result.ok;
  state.bookedSlot = result.ok ? slot : null;

  if (result.ok) {
    // Confirm to the caller (their number is known from setup) and notify owner.
    safeSms(state.caller, `${BUSINESS.name}: you're booked for ${slot.label}. We'll see you then! Reply here if anything changes.`);
    safeSms(OWNER_PHONE, `✅ New booking — ${BUSINESS.name}\n${slot.label}\n${details.name || "?"} · ${details.phone || state.caller}\n${details.job || ""}\n${details.address || ""}`);
  } else {
    console.error("Booking failed:", result.error);
    // Safety net: text a self-serve scheduling link instead.
    textLink(client, state.caller, TWILIO_NUMBER, BUSINESS.name);
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

// ---- End of call: summarize + text the owner -------------------------------
async function endCall(state) {
  if (!state || state.ended) return;
  state.ended = true;

  // Safety net: if no exact slot got locked in, text the caller a self-serve
  // scheduling link (no-ops unless BOOKING_LINK is set). Rosie's "text a link".
  if (!state.booked) textLink(client, state.caller, TWILIO_NUMBER, BUSINESS.name);

  const summary = await summarizeConversation(state.messages);
  const header = state.booked
    ? `📞 Call + booking (${state.bookedSlot?.label}) — ${BUSINESS.name}`
    : `📞 New call — ${BUSINESS.name}`;
  safeSms(OWNER_PHONE, `${header}\nFrom: ${state.caller}\n\n${summary}`);
}

async function summarizeConversation(messages) {
  const transcript = messages.filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Caller" : "Reception"}: ${m.content}`).join("\n");
  const prompt =
    `Summarize this call for the owner of ${BUSINESS.name} in 3–4 terse lines: name, callback number, ` +
    `what they need, address, urgency, and whether an appointment was booked. Say "not given" for anything missing.` +
    `\n\n${transcript}`;
  return (await chat([{ role: "user", content: prompt }], 220)) || transcript;
}

function safeSms(to, body) {
  if (!to || !TWILIO_NUMBER) return;
  client.messages.create({ to, from: TWILIO_NUMBER, body })
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
  server.listen(port, () => console.log(`RingCatch Slice 2.5 listening on :${port} (ws: /relay)`));
}

module.exports = { app, server, wss, buildSystemPrompt, summarizeConversation, makeSpeechFilter, getAvailableSlots, doBooking, extractDetails };
