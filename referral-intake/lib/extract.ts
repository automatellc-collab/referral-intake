import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { NoteSummarySchema } from "@/lib/schema";
import type { AttachmentMediaType } from "@/lib/attachments";

const MODEL = "claude-opus-5";

export interface ExtractAttachment {
  filename: string;
  mediaType: AttachmentMediaType;
  base64: string;
}

function systemPromptFor(specialty: string): string {
  return `You are a clinical intake assistant that drafts specialist pre-chart summaries for a ${specialty} practice. Given a raw referral packet (letter, imaging/lab reports, PCP notes — often combined, sometimes as attached PDFs or images), extract key information into a structured summary.

Extract the following information from the referral:
- openingNarrative: A paragraph summary of the patient, reason for referral, and key details
- activeProblems: List of diagnoses/problems mentioned
- medicalHistory: Past medical history items
- currentMedications: Current medications listed
- allergies: Drug allergies and reactions
- redFlags: Clinically significant findings
- gaps: Missing information a specialist would expect
- specialty: The specialty field

Return ONLY a valid JSON object. No markdown, no extra text. Just the JSON object.`;
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

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (parseError) {
      throw new Error(
        `Invalid JSON from Claude: ${parseError instanceof Error ? parseError.message : String(parseError)}. Raw: ${jsonMatch[0].substring(0, 300)}`,
      );
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
