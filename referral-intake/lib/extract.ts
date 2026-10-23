import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { NoteSummarySchema } from "@/lib/schema";
import type { AttachmentMediaType } from "@/lib/attachments";

const MODEL = "claude-opus-5";

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

interface UploadedFile {
  fileId: string;
  mediaType: AttachmentMediaType;
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
  const uploadedFiles: UploadedFile[] = [];

  try {
    const content: Anthropic.ContentBlockParam[] = [];

    for (const attachment of attachments) {
      const uploaded = await uploadFileToFilesAPI(client, attachment);
      uploadedFiles.push(uploaded);
      content.push(attachmentToFileContentBlock(uploaded, attachment.filename));
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
      const responseContent = response.content[0];
      const message = responseContent && "text" in responseContent ? responseContent.text : "unknown parsing error";
      throw new Error(`Failed to parse extraction output: ${message}`);
    }

    return response.parsed_output;
  } finally {
    await deleteUploadedFiles(client, uploadedFiles);
  }
}

async function uploadFileToFilesAPI(client: Anthropic, attachment: ExtractAttachment): Promise<UploadedFile> {
  const binaryData = Buffer.from(attachment.base64, "base64");
  const mediaTypeToMimeType: Record<AttachmentMediaType, string> = {
    "application/pdf": "application/pdf",
    "image/png": "image/png",
    "image/jpeg": "image/jpeg",
    "image/webp": "image/webp",
    "image/gif": "image/gif",
  };

  const mimeType = mediaTypeToMimeType[attachment.mediaType] || attachment.mediaType;
  const file = new File([binaryData], attachment.filename, { type: mimeType });

  const response = await client.beta.files.upload({
    file,
  });

  return {
    fileId: response.id,
    mediaType: attachment.mediaType,
  };
}

function attachmentToFileContentBlock(
  uploaded: UploadedFile,
  filename: string,
): Anthropic.ContentBlockParam {
  if (uploaded.mediaType === "application/pdf") {
    return {
      type: "document",
      source: {
        type: "file",
        file_id: uploaded.fileId,
      },
    };
  }

  return {
    type: "image",
    source: {
      type: "file",
      file_id: uploaded.fileId,
    },
  };
}

async function deleteUploadedFiles(client: Anthropic, uploadedFiles: UploadedFile[]): Promise<void> {
  for (const file of uploadedFiles) {
    try {
      await client.beta.files.delete(file.fileId);
    } catch {
      // Best-effort cleanup; a failed delete doesn't break extraction
    }
  }
}
