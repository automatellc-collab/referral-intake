import { del, get, head } from "@vercel/blob";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { extractSummary, type ExtractAttachment } from "@/lib/extract";
import { isAllowedAttachmentType, isOwnedBlobUrl, MAX_ATTACHMENTS, MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/attachments";

const MAX_REFERRAL_LENGTH = 20_000;
const MAX_SPECIALTY_LENGTH = 100;

interface RawAttachment {
  filename?: unknown;
  mediaType?: unknown;
  url?: unknown;
}

interface AttachmentRef {
  filename: string;
  mediaType: string;
  url: string;
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

  const refsResult = parseAttachmentRefs(rawAttachments);
  if ("error" in refsResult) {
    return NextResponse.json({ error: refsResult.error }, { status: 400 });
  }
  const refs = refsResult.refs;

  if (referralText.trim().length === 0 && refs.length === 0) {
    return NextResponse.json(
      { error: "Provide referral text, at least one attachment, or both." },
      { status: 400 },
    );
  }

  const attachmentsResult = await resolveAttachments(refs);
  if ("error" in attachmentsResult) {
    // The attachments themselves are unusable as-is (missing or over budget) — nothing
    // to gain by keeping them around for a retry, so clean up now.
    await deleteBlobs(refs.map((ref) => ref.url));
    return NextResponse.json({ error: attachmentsResult.error }, { status: 400 });
  }

  try {
    const summary = await extractSummary(specialty.trim(), referralText, attachmentsResult.attachments);
    await deleteBlobs(refs.map((ref) => ref.url));
    return NextResponse.json({ summary, specialty: specialty.trim() });
  } catch (error: unknown) {
    // Leave the blobs in place: a rate limit or API hiccup is usually transient, and this
    // lets the client retry the same referral without re-uploading its attachments.
    return NextResponse.json({ error: describeError(error) }, { status: statusForError(error) });
  }
}

async function deleteBlobs(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  await del(urls).catch(() => {
    // Best-effort cleanup; a failed delete just leaves an orphaned blob.
  });
}

function parseAttachmentRefs(raw: unknown): { refs: AttachmentRef[] } | { error: string } {
  if (raw === undefined) return { refs: [] };
  if (!Array.isArray(raw)) return { error: "attachments must be an array." };
  if (raw.length > MAX_ATTACHMENTS) {
    return { error: `A maximum of ${MAX_ATTACHMENTS} attachments is supported.` };
  }

  const refs: AttachmentRef[] = [];
  for (const item of raw as RawAttachment[]) {
    const { filename, mediaType, url } = item ?? {};
    if (typeof filename !== "string" || !filename.trim()) {
      return { error: "Each attachment needs a filename." };
    }
    if (typeof mediaType !== "string" || !isAllowedAttachmentType(mediaType)) {
      return { error: `Attachment "${filename}" has an unsupported file type. Use PDF, PNG, JPEG, WEBP, or GIF.` };
    }
    if (typeof url !== "string" || !isOwnedBlobUrl(url)) {
      return { error: `Attachment "${filename}" has an invalid or expired upload reference.` };
    }
    refs.push({ filename, mediaType, url });
  }
  return { refs };
}

async function resolveAttachments(
  refs: AttachmentRef[],
): Promise<{ attachments: ExtractAttachment[] } | { error: string }> {
  if (refs.length === 0) return { attachments: [] };

  let sizes: number[];
  try {
    sizes = await Promise.all(refs.map((ref) => head(ref.url).then((meta) => meta.size)));
  } catch {
    return { error: "One or more attachments could not be found. Please re-attach them and try again." };
  }

  const totalBytes = sizes.reduce((sum, size) => sum + size, 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    return {
      error: `Attachments combined must stay under ${(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)).toFixed(0)}MB — try fewer or smaller files.`,
    };
  }

  try {
    const attachments = await Promise.all(
      refs.map(async (ref) => {
        const result = await get(ref.url, { access: "private" });
        if (!result || result.statusCode !== 200) {
          throw new Error(`Attachment "${ref.filename}" could not be retrieved.`);
        }
        return {
          filename: ref.filename,
          mediaType: ref.mediaType as ExtractAttachment["mediaType"],
          base64: Buffer.from(await new Response(result.stream).arrayBuffer()).toString("base64"),
        };
      }),
    );
    return { attachments };
  } catch {
    return { error: "One or more attachments could not be retrieved. Please re-attach them and try again." };
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
    return "The extraction service is not configured correctly (invalid API key). Contact the site administrator.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "The extraction service is rate limited right now. Please try again shortly.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Could not reach the extraction service. Check your connection and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    const message = error.message || "Unknown API error";
    const status = "status" in error ? ` (HTTP ${error.status})` : "";
    return `Extraction failed: ${message}${status}. This may be a PDF parsing issue — try a different PDF or contact support.`;
  }
  if (error instanceof Error) {
    const message = error.message;
    if (message.includes("Large PDF upload failed")) {
      return "This PDF is too large to process (max ~30MB). Try a smaller or compressed version.";
    }
    return `Extraction failed: ${message}`;
  }
  return "Something went wrong while extracting the referral. Please try again.";
}
