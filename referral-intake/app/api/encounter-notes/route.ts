import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { generateEncounterNote } from "@/lib/generateEncounterNote";

const MIN_TRANSCRIPT_LENGTH = 20;
const MAX_TRANSCRIPT_LENGTH = 50_000;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const { transcript } = (body as { transcript?: unknown } | null) ?? {};

  if (typeof transcript !== "string" || transcript.trim().length < MIN_TRANSCRIPT_LENGTH) {
    return NextResponse.json(
      { error: "transcript is required and must contain enough speech to summarize." },
      { status: 400 },
    );
  }
  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return NextResponse.json(
      { error: `transcript exceeds the ${MAX_TRANSCRIPT_LENGTH.toLocaleString()} character limit.` },
      { status: 400 },
    );
  }

  try {
    const note = await generateEncounterNote(transcript.trim());
    return NextResponse.json({ note });
  } catch (error: unknown) {
    return NextResponse.json({ error: describeError(error) }, { status: statusForError(error) });
  }
}

function statusForError(error: unknown): number {
  if (error instanceof Anthropic.AuthenticationError) return 500;
  if (error instanceof Anthropic.RateLimitError) return 429;
  if (error instanceof Anthropic.APIError) return 502;
  return 500;
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The note service is not configured correctly (invalid API key). Contact the site administrator.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "The note service is rate limited right now. Please try again shortly.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the note service. Check your connection and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    return "The note service returned an error. Please try again.";
  }
  return "Something went wrong while generating the note. Please try again.";
}
