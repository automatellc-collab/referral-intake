/**
 * RingCatch — Slice 2
 * ---------------------
 * Swaps Slice 1's voicemail for a real, back-and-forth SPOKEN conversation.
 *
 * The caller talks; Twilio transcribes each turn (<Gather input="speech">) and
 * posts it to us; OmniRoute (or any OpenAI-compatible LLM) decides the reply;
 * Twilio speaks it back (<Say>). The AI greets, answers basic questions, and
 * collects name + callback number + the job + address + urgency. When it has
 * enough, it wraps up, hangs up, and TEXTS the owner a clean summary.
 *
 * Turn-based (no barge-in yet) — that's the Slice 2.5 upgrade (Twilio
 * ConversationRelay / Media Streams + streaming TTS). This version needs no
 * WebSocket infra: it runs on the same Express webhooks as Slice 1.
 *
 * Flow:
 *   Inbound call            -> POST /voice   (greet, then Gather speech)
 *   Each time caller speaks -> POST /turn    (LLM replies, Gather again — or end)
 *   Call ends               -> POST /status  (summarize convo -> SMS owner)
 */

require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_NUMBER,
  OWNER_PHONE,
  ANTHROPIC_API_KEY,
  LLM_BASE_URL,
  LLM_MODEL,
  LLM_API_KEY,
  PUBLIC_URL,
  VALIDATE_TWILIO,
  PORT,
} = process.env;

// ---- Business "brain" (Slice 4 will let owners edit this via a wizard) ------
// For now a plumber template — matches the trade-template pre-fill plan.
const BUSINESS = {
  name: process.env.BUSINESS_NAME || "Rooter Bros Plumbing",
  trade: process.env.BUSINESS_TRADE || "plumbing",
  hours: process.env.BUSINESS_HOURS || "Mon–Sat, 7am to 6pm",
  services:
    process.env.BUSINESS_SERVICES ||
    "leak repair, water heaters, drain cleaning, toilets, faucets, and emergency calls",
  area: process.env.BUSINESS_AREA || "the greater Marietta and Atlanta area",
  callbackPromise:
    process.env.BUSINESS_CALLBACK || "call you back as soon as they're free, usually within the hour",
};

const VOICE = process.env.TTS_VOICE || "Polly.Matthew"; // Twilio-hosted voice
const END = "[[END]]"; // token the model appends when the conversation is done
const MAX_TURNS = 12; // safety net: wrap up if a model never emits END

// Make an LLM reply safe to speak aloud: drop the END token, emojis, and
// markdown so Twilio never tries to pronounce "😊" or "**".
function sanitizeForSpeech(s) {
  return (s || "")
    .split(END).join(" ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Wiring (mirrors Slice 1) ----------------------------------------------
const app = express();
app.use(express.urlencoded({ extended: false }));
const { VoiceResponse } = twilio.twiml;
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const cbUrl = (path) => (PUBLIC_URL ? `${PUBLIC_URL}${path}` : path);
const guard = twilio.webhook({
  validate: VALIDATE_TWILIO === "true" && Boolean(PUBLIC_URL),
});

// Per-call conversation state. In-memory is fine for one instance; Slice 5
// moves this to the database. { caller, messages: [{role,content}, ...] }
const calls = new Map();

// ---- The system prompt that makes the AI a good phone receptionist ----------
function buildSystemPrompt() {
  return (
    `You are the friendly phone receptionist for ${BUSINESS.name}, a ${BUSINESS.trade} business. ` +
    `You are answering because the owner could not pick up. You are speaking OUT LOUD on a phone call. ` +
    `\n\nYour goals, in order:\n` +
    `1. Greet warmly and find out what the caller needs.\n` +
    `2. Collect these, one question at a time: the caller's name, a callback number, ` +
    `what the job is, the address, and how urgent it is.\n` +
    `3. Answer simple questions using the business info below.\n\n` +
    `Style rules (important — this is spoken aloud):\n` +
    `- Keep EVERY reply to one or two short sentences. No lists, no markdown, no emojis.\n` +
    `- Ask only ONE question at a time. Sound natural and human.\n` +
    `- Do not invent prices or promise specific arrival times.\n` +
    `- If it is a clear emergency (flooding, gas, no water), acknowledge urgency and reassure them.\n\n` +
    `When you have the name, a callback number, and a clear description of the job, ` +
    `thank them by name, tell them the owner will ${BUSINESS.callbackPromise}, say a brief goodbye, ` +
    `and then output ${END} on its own at the very end of that final message. ` +
    `Never output ${END} until you have at least the name and callback number.\n\n` +
    `Business info — hours: ${BUSINESS.hours}. Services: ${BUSINESS.services}. ` +
    `Service area: ${BUSINESS.area}.`
  );
}

// ---- 1) Inbound call: greet, then listen ------------------------------------
app.post("/voice", guard, (req, res) => {
  const twiml = new VoiceResponse();
  const caller = req.body.From || "unknown";

  const greeting =
    `Thanks for calling ${BUSINESS.name}. The owner's on another job right now, ` +
    `but I can help. What can we do for you?`;

  calls.set(req.body.CallSid, {
    caller,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      // Seed the greeting as the assistant's first turn so the model has context.
      { role: "assistant", content: greeting },
    ],
  });

  const gather = twiml.gather({
    input: "speech",
    action: cbUrl("/turn"),
    method: "POST",
    speechTimeout: "auto",
    speechModel: "phone_call",
    actionOnEmptyResult: true,
  });
  gather.say({ voice: VOICE }, greeting);

  res.type("text/xml").send(twiml.toString());
});

// ---- 2) A caller turn: transcribe -> LLM -> speak -> listen again ------------
app.post("/turn", guard, async (req, res) => {
  const twiml = new VoiceResponse();
  const callSid = req.body.CallSid;
  const state = calls.get(callSid);

  // Lost state (restart/cold instance) — fail gracefully.
  if (!state) {
    twiml.say({ voice: VOICE }, "Sorry, something went wrong on our end. Please call again.");
    twiml.hangup();
    return res.type("text/xml").send(twiml.toString());
  }

  const heard = (req.body.SpeechResult || "").trim();

  // Nothing heard — nudge once, then let the loop continue.
  if (!heard) {
    state.silence = (state.silence || 0) + 1;
    if (state.silence >= 2) {
      twiml.say({ voice: VOICE }, "I didn't catch that, so I'll have the owner call you back. Goodbye.");
      twiml.hangup();
      endCall(callSid); // summarize whatever we have
      return res.type("text/xml").send(twiml.toString());
    }
    const g = twiml.gather({
      input: "speech", action: cbUrl("/turn"), method: "POST",
      speechTimeout: "auto", speechModel: "phone_call", actionOnEmptyResult: true,
    });
    g.say({ voice: VOICE }, "Sorry, I didn't catch that — could you say that again?");
    return res.type("text/xml").send(twiml.toString());
  }

  state.silence = 0;
  state.messages.push({ role: "user", content: heard });

  const raw = await assistantReply(state.messages);
  state.messages.push({ role: "assistant", content: raw });
  state.turns = (state.turns || 0) + 1;

  let done = raw.includes(END);
  let reply = sanitizeForSpeech(raw);

  // Safety net: if a model rambles without ever emitting END, wrap up anyway.
  if (!done && state.turns >= MAX_TURNS) {
    done = true;
    reply = `${reply} Thanks — the owner will call you right back. Goodbye.`.trim();
  }
  if (!reply) reply = "Sorry, could you say that again?";

  twiml.say({ voice: VOICE }, reply);

  if (done) {
    twiml.hangup();
    endCall(callSid);
  } else {
    twiml.gather({
      input: "speech", action: cbUrl("/turn"), method: "POST",
      speechTimeout: "auto", speechModel: "phone_call", actionOnEmptyResult: true,
    });
  }

  res.type("text/xml").send(twiml.toString());
});

// ---- 3) Call ended (also a safety net if they hang up mid-convo) ------------
app.post("/status", guard, (req, res) => {
  res.sendStatus(200);
  if (["completed", "no-answer", "busy", "failed"].includes(req.body.CallStatus)) {
    endCall(req.body.CallSid);
  }
});

// ---- Wrap up: summarize the conversation and text the owner -----------------
async function endCall(callSid) {
  const state = calls.get(callSid);
  if (!state || state.ended) return; // once only
  state.ended = true;
  calls.delete(callSid);

  const summary = await summarizeConversation(state.messages);
  const body =
    `📞 New call — ${BUSINESS.name}\n` +
    `From: ${state.caller}\n\n` +
    `${summary}`;

  try {
    await client.messages.create({ to: OWNER_PHONE, from: TWILIO_NUMBER, body });
    console.log(`Texted owner about a call from ${state.caller}.`);
  } catch (err) {
    console.error("Failed to text the owner:", err.message);
  }
}

// ---- LLM: next spoken reply given the conversation so far -------------------
async function assistantReply(messages) {
  const fallback =
    "Thanks — I've got that. The owner will call you right back. Goodbye. " + END;
  const data = await chat(messages, 160);
  return data ?? fallback;
}

// ---- LLM: summarize the whole conversation into an owner-friendly SMS -------
async function summarizeConversation(messages) {
  const transcript = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? "Caller" : "Reception"}: ${m.content}`)
    .join("\n");

  const prompt =
    `Below is a phone call a receptionist handled for ${BUSINESS.name}, a ${BUSINESS.trade} business. ` +
    `Write a 3–4 line summary for the owner: caller's name, callback number, what they need, ` +
    `the address, and how urgent it is. Be terse and factual. If something wasn't given, say "not given".` +
    `\n\nCall:\n${transcript}`;

  const data = await chat([{ role: "user", content: prompt }], 220);
  return data ?? transcript; // raw transcript is still useful if the LLM is down
}

// ---- Shared OpenAI-compatible call (OmniRoute for free dev; any provider) ---
// Returns the reply string, or null on any failure so callers can fall back.
async function chat(messages, maxTokens) {
  const base = LLM_BASE_URL || (ANTHROPIC_API_KEY ? "anthropic" : null);
  if (!base) return null;

  try {
    if (base === "anthropic") {
      // Anthropic wants the system prompt separate from the messages array.
      const system = messages.find((m) => m.role === "system")?.content;
      const rest = messages.filter((m) => m.role !== "system");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: maxTokens,
          ...(system ? { system } : {}),
          messages: rest,
        }),
      });
      const data = await resp.json();
      return data?.content?.[0]?.text?.trim() || null;
    }

    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LLM_API_KEY || "local"}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL || "auto",
        max_tokens: maxTokens,
        stream: false, // one JSON response, not an SSE stream (OmniRoute streams by default)
        messages,
      }),
    });
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error("LLM call failed:", err.message);
    return null;
  }
}

// ---- Health check -----------------------------------------------------------
app.get("/", (_req, res) => res.send("RingCatch Slice 2 (talking) is running."));

// Only listen when run directly, so tests can import the logic without a server.
if (require.main === module) {
  const port = PORT || 3000;
  app.listen(port, () => console.log(`RingCatch Slice 2 listening on :${port}`));
}

module.exports = { app, assistantReply, summarizeConversation, buildSystemPrompt, chat };
