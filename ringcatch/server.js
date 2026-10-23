/**
 * RingCatch — Slice 1
 * ---------------------
 * A phone number that:
 *   1. Answers when the owner can't pick up
 *   2. Asks the caller what they need and records it
 *   3. Transcribes it, summarizes it, and TEXTS the owner a clean summary
 *
 * No conversational AI yet — this slice proves the plumbing end to end
 * (call in -> transcript -> summary -> SMS out). On its own it's already a
 * useful "never lose a missed call" tool.
 *
 * Flow:
 *   Twilio inbound call  ->  POST /voice          (we greet + start recording)
 *   Caller hangs up      ->  POST /after-record   (we say goodbye)
 *   Transcription ready  ->  POST /transcription   (we summarize + SMS the owner)
 */

require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));

const { VoiceResponse } = twilio.twiml;

// ---- Config (from .env) -----------------------------------------------------
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_NUMBER, // the RingCatch number, e.g. +17705550184
  OWNER_PHONE, // where summaries get texted, e.g. +14045551234
  ANTHROPIC_API_KEY, // optional — Anthropic path (paid). Used only if no LLM_BASE_URL.
  // OpenAI-compatible LLM (preferred). Point at OmniRoute for FREE local dev:
  //   LLM_BASE_URL=http://localhost:20128/v1  LLM_MODEL=auto  LLM_API_KEY=local
  // …or any OpenAI-compatible provider (OpenAI, Groq, etc.) for production.
  LLM_BASE_URL,
  LLM_MODEL, // e.g. "auto" for OmniRoute, or "gpt-4o-mini", "claude-haiku-…" upstream
  LLM_API_KEY, // any non-empty string for local OmniRoute
  PUBLIC_URL, // your deployed base URL, e.g. https://ringcatch.onrender.com
  VALIDATE_TWILIO, // "true" to reject requests not signed by Twilio (recommended in prod)
  PORT,
} = process.env;

const BUSINESS_NAME = process.env.BUSINESS_NAME || "our shop";
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Absolute callback URLs so Twilio can reach us. Falls back to a relative path
// (fine for local ngrok testing where Twilio already knows the host).
const cbUrl = (path) => (PUBLIC_URL ? `${PUBLIC_URL}${path}` : path);

// Remember which caller each call belongs to, so the (async) transcription
// callback knows who to attribute it to. In-memory is fine for one instance;
// Slice 5 replaces this with the database.
const callerByCallSid = new Map();

// Only validate Twilio signatures when explicitly turned on AND we know our
// public URL (validation needs the exact URL Twilio called).
const guard = twilio.webhook({
  validate: VALIDATE_TWILIO === "true" && Boolean(PUBLIC_URL),
});

// ---- 1) Inbound call --------------------------------------------------------
app.post("/voice", guard, (req, res) => {
  const twiml = new VoiceResponse();

  callerByCallSid.set(req.body.CallSid, req.body.From || "unknown");

  twiml.say(
    { voice: "Polly.Matthew" },
    `Thanks for calling ${BUSINESS_NAME}. Sorry we can't pick up right now. ` +
      `After the beep, please tell us your name, your number, and what you need, ` +
      `and we'll text you right back.`
  );

  twiml.record({
    maxLength: 120,
    playBeep: true,
    trim: "trim-silence",
    transcribe: true,
    transcribeCallback: cbUrl("/transcription"),
    action: cbUrl("/after-record"),
    finishOnKey: "#",
  });

  // Reached only if the caller left nothing at all.
  twiml.say("We didn't catch that. Please call again. Goodbye.");
  res.type("text/xml").send(twiml.toString());
});

// ---- 2) Recording finished (caller hung up or pressed #) --------------------
app.post("/after-record", guard, (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: "Polly.Matthew" },
    "Got it. We'll be in touch shortly. Goodbye."
  );
  twiml.hangup();
  res.type("text/xml").send(twiml.toString());
});

// ---- 3) Transcription ready -> summarize -> text the owner ------------------
app.post("/transcription", guard, async (req, res) => {
  res.sendStatus(200); // acknowledge Twilio immediately; do the work after

  const callSid = req.body.CallSid;
  const caller =
    callerByCallSid.get(callSid) || req.body.From || "unknown number";
  callerByCallSid.delete(callSid);

  const status = req.body.TranscriptionStatus; // "completed" | "failed"
  const transcript = (req.body.TranscriptionText || "").trim();
  const recordingUrl = req.body.RecordingUrl || "";

  let summary;
  if (status === "completed" && transcript) {
    summary = await summarize(transcript);
  } else {
    summary = "(Couldn't transcribe the message — listen to the recording.)";
  }

  const body =
    `📞 Missed call — ${BUSINESS_NAME}\n` +
    `From: ${caller}\n\n` +
    `${summary}\n\n` +
    (recordingUrl ? `Listen: ${recordingUrl}.mp3` : "");

  try {
    await client.messages.create({ to: OWNER_PHONE, from: TWILIO_NUMBER, body });
    console.log(`Texted owner about a missed call from ${caller}.`);
  } catch (err) {
    console.error("Failed to text the owner:", err.message);
  }
});

// ---- Summarize a voicemail into 2–3 owner-friendly lines --------------------
// Prefers an OpenAI-compatible endpoint (LLM_BASE_URL) — point this at OmniRoute
// for free local dev, or any paid provider in prod. Falls back to the Anthropic
// API if only ANTHROPIC_API_KEY is set, then to the raw transcript.
async function summarize(transcript) {
  const prompt =
    `A caller left this voicemail for ${BUSINESS_NAME}, a plumbing business. ` +
    `Write a 2–3 line summary for the owner: what the caller needs, any address ` +
    `or timing they mentioned, and how urgent it sounds. Be terse and factual. ` +
    `If a callback number was spoken, include it.\n\nVoicemail: "${transcript}"`;

  if (LLM_BASE_URL) return summarizeOpenAI(prompt, transcript);
  if (ANTHROPIC_API_KEY) return summarizeAnthropic(prompt, transcript);
  return transcript; // no LLM configured — the raw transcript is still useful
}

// OpenAI-compatible chat completions (OmniRoute, OpenAI, Groq, …).
async function summarizeOpenAI(prompt, transcript) {
  try {
    const resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${LLM_API_KEY || "local"}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL || "auto",
        max_tokens: 200,
        stream: false, // we want one JSON response, not an SSE stream
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || transcript; // fall back to raw transcript on any surprise
  } catch (err) {
    console.error("Summarize (LLM) failed, sending raw transcript:", err.message);
    return transcript;
  }
}

// Anthropic Messages API (paid). Kept as a fallback path.
async function summarizeAnthropic(prompt, transcript) {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const text = data?.content?.[0]?.text?.trim();
    return text || transcript; // fall back to raw transcript on any surprise
  } catch (err) {
    console.error("Summarize (Anthropic) failed, sending raw transcript:", err.message);
    return transcript;
  }
}

// ---- Health check -----------------------------------------------------------
app.get("/", (_req, res) => res.send("RingCatch Slice 1 is running."));

const port = PORT || 3000;
app.listen(port, () => console.log(`RingCatch listening on :${port}`));
