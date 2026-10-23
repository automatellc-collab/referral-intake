import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NoteSummarySchema } from "@/lib/schema";
import type { AttachmentMediaType } from "@/lib/attachments";

const MODEL = "claude-opus-5";
const BASE64_DIRECT_LIMIT = 20 * 1024 * 1024; // 20MB: use base64 for small files (faster)

/**
 * A document's actual bytes, ready to send to Claude. Distinct from
 * lib/attachments.ts's `Attachment`, which is a reference to a file the
 * browser already uploaded to Blob storage — the API route resolves one into
 * the other before calling extractSummary.
 */
export interface ExtractAttachment {
  filename: string;
  mediaType: AttachmentMediaType;
  base64: string;
}

function systemPromptFor(specialty: string): string {
  return `You are a clinical intake assistant that drafts specialist pre-chart summaries for a ${specialty} practice. Given a raw referral packet (letter, imaging/lab reports, PCP notes — often combined, sometimes as attached PDFs or images), extract the fields in the schema into a consult-note-style structure so the specialist can review and continue directly into their own documentation.

Rules:
- Never invent or infer a clinical fact that is not supported by the text. If something is not present, leave it empty — do not guess.
- The schema deliberately excludes vitals, physical exam, and assessment & plan — those require the in-person visit and must never be fabricated. Do not attempt to fill them.
- openingNarrative is a draft dictation-style paragraph built only from facts explicitly present in the referral. If key facts (age, referring physician, reason) are missing, write a shorter paragraph rather than filling gaps — set status to "inferred" if you had to lightly restructure phrasing, "extracted" if it is a close restatement of the source, "missing" if there isn't enough to draft one.
- icdCode on an active problem must be copied verbatim from the referral if present. Never assign or guess an ICD-10 code yourself, even for a plainly stated diagnosis.
- resultsTimeline should include every dated lab or imaging result found anywhere in the packet, sorted chronologically.
- You do not know today's date and must not assume one. Never compute or flag an age/date-of-birth discrepancy, a patient's current age from their DOB, or how much time has elapsed since a dated event, unless the referral itself states both figures needed for the comparison. Only flag a discrepancy that is internally inconsistent within the referral's own stated facts — never one that requires assuming what today's date is.
- redFlags are clinically significant terms or findings found anywhere in the text, each with surrounding context, so the reviewing clinician can confirm significance.
- gaps are standard information a ${specialty} specialist would expect that is absent from this referral.
- This output is a drafting aid only — a suggested summary the physician reviews and edits, never a final note.`;
}

export async function extractSummary(
  specialty: string,
  referralText: string,
  attachments: ExtractAttachment[] = [],
): Promise<unknown> {
  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];
  const uploadedFileIds: string[] = [];

  try {
    // Process attachments: use Files API for large files, base64 for small ones
    for (const attachment of attachments) {
      if (attachment.base64.length > BASE64_DIRECT_LIMIT) {
        // Large file: upload via Files API (supports multi-GB files)
        try {
          const fileId = await uploadToFilesAPI(client, attachment);
          uploadedFileIds.push(fileId);
          if (attachment.mediaType === "application/pdf") {
            content.push({
              type: "document",
              source: { type: "file", file_id: fileId },
            });
          } else {
            content.push({
              type: "image",
              source: { type: "file", file_id: fileId },
            });
          }
        } catch (fileApiError) {
          console.error("Files API upload failed:", fileApiError);
          throw new Error(`Failed to process large file: ${fileApiError instanceof Error ? fileApiError.message : String(fileApiError)}`);
        }
      } else {
        // Small file: use base64 (faster, simpler)
        content.push(attachmentToContentBlock(attachment));
      }
    }

    content.push({
      type: "text",
      text: `Extract the pre-chart summary for this referral packet.${
        attachments.length > 0
          ? ` The packet includes ${attachments.length} attached document(s) (${attachments
              .map((a) => a.filename)
              .join(", ")}) — read them directly for imaging/lab findings rather than relying only on the text below.`
          : ""
      }\n\nCover text:\n${referralText || "(no cover text — see attached documents)"}`,
    });

    try {
      // Try strict structured output first
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: 4096,
        system: systemPromptFor(specialty),
        messages: [{ role: "user", content }],
        output_config: {
          format: zodOutputFormat(NoteSummarySchema),
        },
      });

      if (!response.parsed_output) {
        // Fallback: try flexible extraction without strict schema validation
        console.warn("Structured output parsing failed, trying flexible extraction");
        return await flexibleExtract(client, specialty, content);
      }

      return response.parsed_output;
    } catch (parseError) {
      // If structured parsing throws, try flexible extraction as fallback
      console.warn("Structured parsing error, trying flexible extraction:", parseError);
      return await flexibleExtract(client, specialty, content);
    }
  } finally {
    // Clean up uploaded files
    for (const fileId of uploadedFileIds) {
      try {
        await client.beta.files.delete(fileId);
      } catch (error) {
        console.error("Failed to delete uploaded file:", error);
      }
    }
  }
}

async function flexibleExtract(
  client: Anthropic,
  specialty: string,
  content: Anthropic.ContentBlockParam[],
): Promise<unknown> {
  // Flexible extraction without strict schema validation
  const flexContent = [...content];
  // Update the prompt to request flexible JSON output
  const lastText = flexContent[flexContent.length - 1];
  if (lastText && lastText.type === "text") {
    flexContent[flexContent.length - 1] = {
      ...lastText,
      text:
        lastText.text +
        "\n\nReturn a JSON object with these fields: openingNarrative, activeProblems (list), medicalHistory (list), currentMedications (list), allergies (list), redFlags (list), gaps (list), specialty. Use your best judgment to extract and structure the available data.",
    };
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPromptFor(specialty),
    messages: [{ role: "user", content: flexContent }],
  });

  const responseContent = response.content[0];
  if (!responseContent || responseContent.type !== "text") {
    const contentType = responseContent?.type || "none";
    const details = responseContent && "text" in responseContent ? String(responseContent.text) : "";
    throw new Error(`Claude did not return text (got: ${contentType}). Response: ${details.substring(0, 200)}`);
  }

  const text = responseContent.text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`Could not extract JSON from response: ${text.substring(0, 200)}`);
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    throw new Error(`Failed to parse flexible extraction output: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
  }
}

async function uploadToFilesAPI(client: Anthropic, attachment: ExtractAttachment): Promise<string> {
  // Convert base64 to binary buffer
  const binaryData = Buffer.from(attachment.base64, "base64");

  // Create File object with correct MIME type
  const file = new File([binaryData], attachment.filename, { type: attachment.mediaType });

  // Upload via Files API (supports multi-GB files)
  const response = await client.beta.files.upload({ file });
  return response.id;
}

function attachmentToContentBlock(attachment: ExtractAttachment): Anthropic.ContentBlockParam {
  if (attachment.mediaType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: attachment.base64 },
    };
  }
  return {
    type: "image",
    source: { type: "base64", media_type: attachment.mediaType, data: attachment.base64 },
  };
}
