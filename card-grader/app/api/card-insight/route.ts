import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import type { CardInsightRequest, CardInsightResult } from "@/lib/insightTypes";

const SYSTEM_PROMPT = `You are a knowledgeable trading card hobbyist assistant embedded in a card-grading app. Your job is to (1) identify the card shown in the photo(s), (2) assess the card's surface condition by actually looking at the image, and (3) give an illustrative, rough value estimate.

Hard rules:
- You are NOT a certified grader or authenticator (not PSA, BGS, SGC, JSA, or similar). Never state or imply that a signature, autograph, or card is "authentic," "verified," or "genuine." If a signature-like mark is visible, describe it only in neutral, factual terms (e.g. "a handwritten signature in blue ink appears across the lower right of the image") and explicitly note that authenticity cannot be determined from a photo.
- Surface assessment: look at the actual image and distinguish genuine printed/manufacturing texture (ink, foil patterns, photo grain — normal, not damage) from real physical defects (scratches, scuffing, creasing, stains, print lines that are actually defects rather than the card's intended design). Score 1-10 on the same scale used elsewhere in the app (10 = flawless, no visible defects; lower = visible damage), based on what you can actually see — not a guess. If the image resolution, angle, or glare makes a real assessment impossible, set the score to null and say why in the reasoning rather than guessing.
- Value estimates are illustrative only, drawn from your general knowledge of the hobby, not live market data. Always say so in the caveats.
- If you cannot identify the card with confidence, say so plainly: set confidence to "low" and leave identification fields null rather than guessing specifics.
- Respond with strictly valid JSON only — no markdown code fences, no commentary before or after, matching exactly the schema given in the user message.`;

function buildUserPrompt(grade: CardInsightRequest["grade"]): string {
  return `Condition estimate already computed locally from the photo (1-10 scale, PSA-style): overall range ${grade.low}-${grade.high}, centering ${grade.centering.toFixed(1)}, corners ${grade.corners.toFixed(1)}, edges ${grade.edges.toFixed(1)}.

Note: a local pixel-texture filter also guessed a surface score of ${grade.surfaceHeuristic.toFixed(1)}, but that filter is known to be unreliable — it frequently mistakes printed card detail for damage. Ignore it and form your own surface assessment purely from what you see in the photo.

Identify this card, assess its surface condition, and give a rough value estimate consistent with the overall condition. Respond with ONLY a JSON object matching exactly this shape, no markdown fences, no extra text:
{
  "identification": { "subject": string|null, "setName": string|null, "year": string|null, "cardNumber": string|null, "variant": string|null, "confidence": "low"|"medium"|"high" },
  "signatureNote": string|null,
  "surfaceAssessment": { "score": number|null, "reasoning": string },
  "valueEstimate": { "low": number|null, "high": number|null, "currency": "USD", "basis": string },
  "caveats": string[]
}`;
}

function parseInsightJson(text: string): CardInsightResult | null {
  const trimmed = text.trim();
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) return null;

  try {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as CardInsightResult;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server is not configured with an Anthropic API key." }, { status: 500 });
  }

  let body: CardInsightRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.frontImageBase64) {
    return NextResponse.json({ error: "A front image is required." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  const content: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: body.frontImageBase64 } },
        ...(body.backImageBase64
          ? [{ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: body.backImageBase64 } }]
          : []),
        { type: "text", text: buildUserPrompt(body.grade) },
      ],
    },
  ];

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: content,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "No text response from model." }, { status: 502 });
    }

    const parsed = parseInsightJson(textBlock.text);
    if (!parsed) {
      console.error(
        "[card-insight] failed to parse model response",
        JSON.stringify({ stopReason: response.stop_reason, textLength: textBlock.text.length }),
      );
      return NextResponse.json({ error: "Could not parse the model's response." }, { status: 502 });
    }

    return NextResponse.json(parsed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Card insight request failed: ${message}` }, { status: 502 });
  }
}
