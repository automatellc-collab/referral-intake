import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EncounterNoteSchema } from "@/lib/encounterSchema";

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT = `You are a clinical scribe assistant. You are given a raw speech-to-text transcript of a physician-patient encounter. Browser speech recognition is imperfect — expect filler words, run-on sentences, misheard words, and interruptions.

Rules:
- Only include content actually present in the transcript. Never invent, infer, or complete a thought the speaker didn't finish — if something is ambiguous or garbled, put the excerpt in unclearSegments instead of guessing what was meant.
- Do not add clinical facts, exam findings, or plan items that are plausible but not actually stated.
- vitalsMentioned and examFindings should only include things the clinician (or a device readout being read aloud) actually said — not things a clinician would typically check.
- This output is a drafting aid only. It becomes part of the medical record only after the clinician reviews and signs off — never present it as already final.`;

export async function generateEncounterNote(transcript: string): Promise<unknown> {
  const client = new Anthropic();

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the encounter transcript. Extract the structured note:\n\n${transcript}`,
      },
    ],
    output_config: {
      format: zodOutputFormat(EncounterNoteSchema),
    },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable structured note.");
  }

  return response.parsed_output;
}
