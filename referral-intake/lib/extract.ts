import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { type NoteSummary } from "@/lib/schema";
import type { AttachmentMediaType } from "@/lib/attachments";
import { orchestrateExtraction } from "@/lib/extraction-orchestrator";
import { classifyDocument } from "@/lib/document-classifier";

export interface ExtractAttachment {
  filename: string;
  mediaType: AttachmentMediaType;
  base64: string;
}

export interface EnrichedExtractionResult {
  summary: NoteSummary;
  confidence: number;
  documentType: string;
  requiresReview: boolean;
  reviewReason?: string;
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
): Promise<EnrichedExtractionResult> {
  const client = new Anthropic();
  const uploadedFileIds: string[] = [];
  let pdfBase64: string | undefined;

  try {
    // Step 1: Classify document type
    console.log("[Extraction] Step 1: Classifying document...");
    const primaryPDF = attachments.find((a) => a.mediaType === "application/pdf");
    const classificationText = primaryPDF ? referralText.substring(0, 2000) : referralText;
    const classification = await classifyDocument(
      classificationText,
      primaryPDF?.filename || "referral",
    );
    console.log(`[Extraction] Document type: ${classification.type} (confidence: ${classification.confidence})`);

    // Step 2: Prepare multimodal content (vision + text)
    console.log("[Extraction] Step 2: Preparing content...");
    const content: Anthropic.ContentBlockParam[] = [];

    // Use PDF with vision if available
    for (const attachment of attachments) {
      if (attachment.mediaType === "application/pdf" && !pdfBase64) {
        if (attachment.base64.length > 10 * 1024 * 1024) {
          // Large file: use Files API
          try {
            const fileId = await uploadToFilesAPI(client, attachment);
            uploadedFileIds.push(fileId);
            content.push({
              type: "document",
              source: { type: "file", file_id: fileId },
            });
          } catch (error) {
            console.warn("Files API failed, falling back to base64");
            pdfBase64 = attachment.base64;
          }
        } else {
          // Small file: use base64 (faster)
          pdfBase64 = attachment.base64;
        }
      }
    }

    // Step 3: Orchestrated extraction with 4 fallback controls
    console.log("[Extraction] Step 3: Running orchestrated extraction...");
    const orchestrationResult = await orchestrateExtraction(specialty, referralText, pdfBase64);

    if (!orchestrationResult.summary) {
      throw new Error(
        `Extraction failed after ${orchestrationResult.totalAttempts} attempts: ${orchestrationResult.controls
          .flatMap((c) => c.errors)
          .join("; ")}`,
      );
    }

    return {
      summary: orchestrationResult.summary,
      confidence: orchestrationResult.confidence,
      documentType: classification.type,
      requiresReview: orchestrationResult.requiresReview,
      reviewReason: orchestrationResult.reviewReason,
    };
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
