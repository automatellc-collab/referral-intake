import "server-only";

import {
  extractWithVision,
  extractWithFlexibleFormat,
  type MultimodalExtractionResult,
} from "./multimodal-extractor";
import { validateMedicalContent } from "./medical-validator";
import { type NoteSummary } from "./schema";

export interface ExtractionControl {
  name: string;
  attempt: number;
  method: string;
  success: boolean;
  confidence: number;
  errors: string[];
}

export interface OrchestratedExtractionResult {
  summary: NoteSummary | null;
  confidence: number;
  method: "vision-structured" | "flexible" | "medical-grounded" | "human-review";
  controls: ExtractionControl[];
  requiresReview: boolean;
  reviewReason?: string;
  totalAttempts: number;
}

export async function orchestrateExtraction(
  specialty: string,
  referralText: string,
  pdfBase64: string | undefined,
): Promise<OrchestratedExtractionResult> {
  const controls: ExtractionControl[] = [];
  let bestResult: MultimodalExtractionResult | null = null;
  let attempt = 0;

  // CONTROL 1: Vision-first structured extraction
  attempt++;
  console.log(`[Control 1] Attempting vision-structured extraction...`);
  const visionResult = await extractWithVision(specialty, referralText, pdfBase64);
  controls.push({
    name: "Vision-Structured Extraction",
    attempt,
    method: visionResult.method,
    success: !!visionResult.summary,
    confidence: visionResult.confidence,
    errors: visionResult.errors,
  });

  if (visionResult.summary) {
    bestResult = visionResult;
    console.log(`[Control 1] ✓ Success with confidence ${visionResult.confidence}`);
  } else {
    console.log(`[Control 1] ✗ Failed: ${visionResult.errors.join("; ")}`);
  }

  // CONTROL 2: Flexible format extraction (if structured failed)
  if (!bestResult) {
    attempt++;
    console.log(`[Control 2] Attempting flexible format extraction...`);
    const flexibleResult = await extractWithFlexibleFormat(specialty, referralText, pdfBase64);
    controls.push({
      name: "Flexible Format Extraction",
      attempt,
      method: flexibleResult.method,
      success: !!flexibleResult.summary,
      confidence: flexibleResult.confidence,
      errors: flexibleResult.errors,
    });

    if (flexibleResult.summary) {
      bestResult = flexibleResult;
      console.log(`[Control 2] ✓ Success with confidence ${flexibleResult.confidence}`);
    } else {
      console.log(`[Control 2] ✗ Failed: ${flexibleResult.errors.join("; ")}`);
    }
  }

  // CONTROL 3: Medical validation & confidence scoring (if extraction succeeded)
  if (bestResult?.summary) {
    attempt++;
    console.log(`[Control 3] Running medical validation & confidence scoring...`);
    const validationResult = await validateMedicalContent(bestResult.summary, specialty);

    const adjustedConfidence = bestResult.confidence * validationResult.validityScore;
    controls.push({
      name: "Medical Validation",
      attempt,
      method: "validation",
      success: validationResult.isValid,
      confidence: adjustedConfidence,
      errors: validationResult.issues,
    });

    if (validationResult.isValid) {
      bestResult.confidence = Math.min(adjustedConfidence, 0.95);
      console.log(`[Control 3] ✓ Medical validation passed`);
    } else {
      console.log(
        `[Control 3] ⚠ Medical validation issues: ${validationResult.issues.join("; ")}`,
      );
    }
  }

  // CONTROL 4: Human review decision (if confidence is low or validation issues found)
  attempt++;
  const shouldFlagForReview =
    !bestResult?.summary ||
    bestResult.confidence < 0.7 ||
    controls.some((c) => c.errors.length > 0);

  if (shouldFlagForReview) {
    console.log(`[Control 4] Flagging for human review...`);
    controls.push({
      name: "Human Review Flag",
      attempt,
      method: "review-decision",
      success: true,
      confidence: 0,
      errors: [`Confidence: ${bestResult?.confidence || 0}, Extraction issues found`],
    });
  }

  return {
    summary: bestResult?.summary || null,
    confidence: bestResult?.confidence || 0,
    method: bestResult?.method === "structured" ? "vision-structured" : "flexible",
    controls,
    requiresReview: shouldFlagForReview,
    reviewReason: shouldFlagForReview
      ? `Confidence ${bestResult?.confidence || 0} below threshold or validation issues`
      : undefined,
    totalAttempts: attempt,
  };
}
