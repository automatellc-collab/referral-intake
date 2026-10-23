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
  const requestId = `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();

  try {
    // === PHASE 2: DOCUMENT CLASSIFICATION ===
    console.log(`[${requestId}] Step 1: Classifying document...`);
    const primaryPDF = attachments.find((a) => a.mediaType === "application/pdf");
    const classificationText = primaryPDF ? referralText.substring(0, 2000) : referralText;
    const classification = await classifyDocument(
      classificationText,
      primaryPDF?.filename || "referral",
    );
    console.log(
      `[${requestId}] Document type: ${classification.type} (confidence: ${classification.confidence})`,
    );

    // === PHASE 1: MULTIMODAL EXTRACTION WITH VISION ===
    console.log(`[${requestId}] Step 2: Preparing multimodal content...`);

    // Use PDF with vision if available
    for (const attachment of attachments) {
      if (attachment.mediaType === "application/pdf" && !pdfBase64) {
        if (attachment.base64.length > 10 * 1024 * 1024) {
          try {
            const fileId = await uploadToFilesAPI(client, attachment);
            uploadedFileIds.push(fileId);
          } catch (error) {
            console.warn("Files API failed, falling back to base64");
            pdfBase64 = attachment.base64;
          }
        } else {
          pdfBase64 = attachment.base64;
        }
      }
    }

    // === PHASE 3: ESCALATING EXTRACTION WITH MODEL SELECTION ===
    console.log(`[${requestId}] Step 3: Running escalating extraction...`);
    const { escalatingExtraction } = await import("./model-escalation");
    const escalationResult = await escalatingExtraction(
      specialty,
      referralText,
      pdfBase64,
      0.65, // confidence threshold
    );

    if (!escalationResult.summary) {
      throw new Error(
        `Extraction failed: ${escalationResult.attempts
          .map((a) => `${a.model}(${a.error || "no error"})`)
          .join(", ")}`,
      );
    }

    // === PHASE 4: MEDICAL VALIDATION AND GROUNDING ===
    console.log(`[${requestId}] Step 4: Medical validation...`);
    const { validateMedicalContent } = await import("./medical-validator");
    const validationResult = await validateMedicalContent(escalationResult.summary, specialty);

    let confidence = escalationResult.confidence * validationResult.validityScore;
    const validationErrors = validationResult.issues;

    // === PHASE 5: REVIEW ROUTING ===
    console.log(`[${requestId}] Step 5: Determining review requirements...`);
    const { determineReviewNeeded, generateReviewSummary } = await import("./review-system");
    const reviewDecision = await determineReviewNeeded(
      escalationResult.summary,
      confidence,
      classification.type,
      validationErrors,
    );

    let reviewReason: string | undefined;
    if (reviewDecision.needsReview) {
      reviewReason = await generateReviewSummary(
        escalationResult.summary,
        confidence,
        classification.type,
        reviewDecision.reasons,
      );
    }

    // === PHASE 6: FORMAT DETECTION ===
    console.log(`[${requestId}] Step 6: Format analysis...`);
    const { detectFormat } = await import("./format-handler");
    const formatAnalysis = await detectFormat(referralText, primaryPDF?.filename || "referral");

    // Adjust confidence based on format
    if (formatAnalysis.format === "scanned-pdf") {
      confidence *= 0.95; // Slight penalty for scanned docs
    }

    // === PHASE 7: ANALYTICS & AUDIT LOG ===
    console.log(`[${requestId}] Step 7: Logging metrics...`);
    const latencyMs = Date.now() - startTime;
    const { logAudit } = await import("./db/storage");

    logAudit({
      requestId,
      input: referralText,
      specialty,
      documentType: classification.type,
      model: escalationResult.model,
      extractionMethod: escalationResult.model.includes("haiku") ? "haiku" : "escalated",
      success: true,
      confidence,
      tokensUsed: escalationResult.totalTokens,
      estimatedCost: escalationResult.estimatedCost,
      latencyMs,
      retryCount: escalationResult.attempts.length - 1,
    }).catch((e) => console.error("Audit logging failed:", e));

    console.log(`[${requestId}] ✓ Complete (${latencyMs}ms, confidence: ${(confidence * 100).toFixed(1)}%)`);

    return {
      summary: escalationResult.summary,
      confidence: Math.min(confidence, 1.0),
      documentType: classification.type,
      requiresReview: reviewDecision.needsReview,
      reviewReason,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const { logAudit } = await import("./db/storage");

    logAudit({
      requestId,
      input: referralText,
      specialty,
      model: "unknown",
      extractionMethod: "failed",
      success: false,
      latencyMs,
      errorMessage: error instanceof Error ? error.message : String(error),
      retryCount: 0,
    }).catch((e) => console.error("Audit logging failed:", e));

    throw error;
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
