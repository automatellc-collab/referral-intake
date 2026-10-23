import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { NoteSummarySchema, type NoteSummary } from "@/lib/schema";
import type { AttachmentMediaType } from "@/lib/attachments";

const MODEL = "claude-opus-5";

export interface ExtractAttachment {
  filename: string;
  mediaType: AttachmentMediaType;
  base64: string;
}

function systemPromptFor(specialty: string): string {
  return `You are a clinical intake assistant that extracts specialist pre-chart summaries for a ${specialty} practice from raw referral packets (letters, imaging reports, lab results, PCP notes). Extract information into this exact JSON structure:

{
  "openingNarrative": {
    "status": "extracted" | "inferred" | "missing",
    "value": "Single draft paragraph — age, referring physician, reason, symptoms, timeline, history. Dictation style, only explicit facts."
  },
  "urgency": {
    "level": "Routine" | "Urgent" | "STAT",
    "rationale": "One sentence explaining why, quoting trigger language if present."
  },
  "resultsTimeline": [
    { "date": "e.g. 7/21/2026", "test": "Test name", "finding": "Result as stated" }
  ],
  "reviewOfSystemsNotes": ["Explicit symptom positives/negatives from referral"],
  "medicalHistory": ["Past medical history items"],
  "activeProblems": [
    { "diagnosis": "Diagnosis name", "icdCode": "ICD-10 only if explicit in text, else empty string" }
  ],
  "surgicalHistory": ["Past surgical procedures"],
  "currentMedications": {
    "status": "extracted" | "inferred" | "missing",
    "items": ["Medication names and doses as listed"]
  },
  "allergies": {
    "status": "extracted" | "inferred" | "missing",
    "items": ["Drug name: reaction type"]
  },
  "socialHistoryNotes": ["Smoking status, occupation if relevant"],
  "redFlags": [
    { "term": "Clinically significant finding", "context": "Sentence it appeared in" }
  ],
  "gaps": ["Standard ${specialty} information missing from this referral"]
}

Return ONLY valid JSON. No markdown, no extra text.`;
}

export async function extractSummary(
  specialty: string,
  referralText: string,
  attachments: ExtractAttachment[] = [],
): Promise<NoteSummary> {
  const client = new Anthropic();

  const content: Anthropic.ContentBlockParam[] = [];
  const uploadedFileIds: string[] = [];

  try {
    // Add attachments to message
    for (const attachment of attachments) {
      if (attachment.mediaType === "application/pdf") {
        // Large files use Files API
        if (attachment.base64.length > 10 * 1024 * 1024) {
          try {
            const fileId = await uploadToFilesAPI(client, attachment);
            uploadedFileIds.push(fileId);
            content.push({
              type: "document",
              source: { type: "file", file_id: fileId },
            });
          } catch (error) {
            console.error("Files API failed, using base64:", error);
            content.push(attachmentToContentBlock(attachment));
          }
        } else {
          // Small files use base64 (faster)
          content.push(attachmentToContentBlock(attachment));
        }
      } else {
        // Images always use base64
        content.push(attachmentToContentBlock(attachment));
      }
    }

    // Add the extraction request
    content.push({
      type: "text",
      text: `Extract the pre-chart summary for this referral packet.${
        attachments.length > 0
          ? ` The packet includes ${attachments.length} attached document(s) (${attachments
              .map((a) => a.filename)
              .join(", ")}) — read them directly for findings rather than relying only on the text below.`
          : ""
      }\n\nCover text:\n${referralText || "(no cover text — see attached documents)"}`,
    });

    // Simple, reliable extraction: just ask Claude to return JSON
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPromptFor(specialty),
      messages: [{ role: "user", content }],
    });

    // Extract text response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("Claude did not return a text response");
    }

    const text = textContent.text;

    // Find and parse JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`No JSON found in response. Got: ${text.substring(0, 300)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      throw new Error(
        `Invalid JSON from Claude: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw: ${jsonMatch[0].substring(0, 300)}`,
      );
    }

    // Validate against NoteSummary schema
    try {
      return NoteSummarySchema.parse(parsed);
    } catch (validationError) {
      const details = validationError instanceof Error ? validationError.message : String(validationError);
      throw new Error(`Validation failed: ${details}`);
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

async function uploadToFilesAPI(client: Anthropic, attachment: ExtractAttachment): Promise<string> {
  const binaryData = Buffer.from(attachment.base64, "base64");
  const file = new File([binaryData], attachment.filename, { type: attachment.mediaType });

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
