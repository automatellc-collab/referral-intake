import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { extractSummary } from "@/lib/extract";
import { isAllowedAttachmentType, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES, type Attachment } from "@/lib/attachments";

const MAX_REFERRAL_LENGTH = 20_000;
const MAX_SPECIALTY_LENGTH = 100;

interface RawAttachment {
  filename?: unknown;
  mediaType?: unknown;
  base64?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const {
    referralText,
    specialty,
    attachments: rawAttachments,
  } = (body as { referralText?: unknown; specialty?: unknown; attachments?: unknown } | null) ?? {};

  if (typeof referralText !== "string") {
    return NextResponse.json({ error: "referralText must be a string." }, { status: 400 });
  }
  if (referralText.length > MAX_REFERRAL_LENGTH) {
    return NextResponse.json(
      { error: `referralText exceeds the ${MAX_REFERRAL_LENGTH.toLocaleString()} character limit.` },
      { status: 400 },
    );
  }
  if (typeof specialty !== "string" || specialty.trim().length === 0) {
    return NextResponse.json({ error: "specialty is required." }, { status: 400 });
  }
  if (specialty.length > MAX_SPECIALTY_LENGTH) {
    return NextResponse.json(
      { error: `specialty exceeds the ${MAX_SPECIALTY_LENGTH} character limit.` },
      { status: 400 },
    );
  }

  const attachmentsResult = parseAttachments(rawAttachments);
  if ("error" in attachmentsResult) {
    return NextResponse.json({ error: attachmentsResult.error }, { status: 400 });
  }
  const attachments = attachmentsResult.attachments;

  if (referralText.trim().length === 0 && attachments.length === 0) {
    return NextResponse.json(
      { error: "Provide referral text, at least one attachment, or both." },
      { status: 400 },
    );
  }

  try {
    const summary = await extractSummary(specialty.trim(), referralText, attachments);
    return NextResponse.json({ summary, specialty: specialty.trim() });
  } catch (error: unknown) {
    return NextResponse.json({ error: describeError(error) }, { status: statusForError(error) });
  }
}

function parseAttachments(raw: unknown): { attachments: Attachment[] } | { error: string } {
  if (raw === undefined) return { attachments: [] };
  if (!Array.isArray(raw)) return { error: "attachments must be an array." };
  if (raw.length > MAX_ATTACHMENTS) {
    return { error: `A maximum of ${MAX_ATTACHMENTS} attachments is supported.` };
  }

  const attachments: Attachment[] = [];
  let totalRawBytes = 0;
  for (const item of raw as RawAttachment[]) {
    const { filename, mediaType, base64 } = item ?? {};
    if (typeof filename !== "string" || !filename.trim()) {
      return { error: "Each attachment needs a filename." };
    }
    if (typeof mediaType !== "string" || !isAllowedAttachmentType(mediaType)) {
      return { error: `Attachment "${filename}" has an unsupported file type. Use PDF, PNG, JPEG, WEBP, or GIF.` };
    }
    if (typeof base64 !== "string" || base64.length === 0) {
      return { error: `Attachment "${filename}" is missing file data.` };
    }
    totalRawBytes += (base64.length * 3) / 4;
    attachments.push({ filename, mediaType, base64 });
  }

  if (totalRawBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      error: `Attachments combined must stay under ${(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB — try fewer or smaller files.`,
    };
  }

  return { attachments };
}

function statusForError(error: unknown): number {
  if (error instanceof Anthropic.AuthenticationError) return 500;
  if (error instanceof Anthropic.RateLimitError) return 429;
  if (error instanceof Anthropic.APIError) return 502;
  return 500;
}

function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The extraction service is not configured correctly (invalid API key). Contact the site administrator.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "The extraction service is rate limited right now. Please try again shortly.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the extraction service. Check your connection and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    return "The extraction service returned an error. Please try again.";
  }
  return "Something went wrong while extracting the referral. Please try again.";
}
