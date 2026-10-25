import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { type NoteSummary } from "./schema";

export type ReviewReason = "low-confidence" | "validation-failed" | "red-flag" | "incomplete" | "manual";

export interface ReviewCase {
  extractionId: string;
  specialty: string;
  documentType: string;
  summary: NoteSummary;
  confidence: number;
  reasons: ReviewReason[];
  priority: "critical" | "urgent" | "standard";
  reviewedAt?: Date;
  approvedBy?: string;
  corrections?: Partial<NoteSummary>;
  notes?: string;
}

export async function determineReviewNeeded(
  summary: NoteSummary,
  confidence: number,
  documentType: string,
  validationIssues: string[],
): Promise<{ needsReview: boolean; reasons: ReviewReason[]; priority: string }> {
  const reasons: ReviewReason[] = [];
  let priority = "standard";

  // Check confidence threshold
  if (confidence < 0.65) {
    reasons.push("low-confidence");
    if (confidence < 0.5) priority = "urgent";
  }

  // Check for validation issues
  if (validationIssues.length > 0) {
    reasons.push("validation-failed");
    if (validationIssues.some((i) => i.includes("CRITICAL"))) {
      priority = "critical";
    }
  }

  // Check for red flags in content
  if (summary.redFlags && summary.redFlags.length > 0) {
    reasons.push("red-flag");
    if (summary.redFlags.length > 3) {
      priority = "urgent";
    }
  }

  // Check for gaps (missing critical info)
  if (summary.gaps && summary.gaps.length > 5) {
    reasons.push("incomplete");
  }

  // Scanned documents are riskier
  if (documentType === "scanned-pdf" && confidence < 0.8) {
    reasons.push("incomplete");
    if (priority === "standard") priority = "urgent";
  }

  return {
    needsReview: reasons.length > 0,
    reasons,
    priority,
  };
}

export async function generateReviewSummary(
  summary: NoteSummary,
  confidence: number,
  documentType: string,
  reviewReasons: ReviewReason[],
): Promise<string> {
  const client = new Anthropic();

  const prompt = `Generate a brief clinician-facing review summary for this extraction.

Confidence: ${(confidence * 100).toFixed(0)}%
Document Type: ${documentType}
Review Reasons: ${reviewReasons.join(", ")}

Key extracted data:
- Opening: ${summary.openingNarrative.value.substring(0, 100)}...
- Urgency: ${summary.urgency.level}
- Active Problems: ${summary.activeProblems.map((p) => p.diagnosis).join(", ") || "None listed"}
- Medications: ${summary.currentMedications.items.slice(0, 3).join(", ") || "None listed"}
- Red Flags: ${summary.redFlags.map((r) => r.term).join(", ") || "None"}
- Gaps: ${summary.gaps.slice(0, 3).join(", ") || "None"}

Write a 1-2 sentence summary highlighting what needs clinician review.`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (textContent && textContent.type === "text") {
      return textContent.text;
    }
  } catch (error) {
    console.error("Failed to generate review summary:", error);
  }

  return `Low confidence (${(confidence * 100).toFixed(0)}%) extraction. Please review: ${reviewReasons.join(", ")}`;
}

export function scoreFeedbackValue(feedback: Partial<NoteSummary>): number {
  // Score 0-1 how valuable this feedback is for improving models
  let score = 0;
  let fieldCount = 0;

  if (feedback.openingNarrative) {
    score += 0.15;
    fieldCount++;
  }
  if (feedback.activeProblems && feedback.activeProblems.length > 0) {
    score += 0.2;
    fieldCount++;
  }
  if (feedback.currentMedications?.items && feedback.currentMedications.items.length > 0) {
    score += 0.15;
    fieldCount++;
  }
  if (feedback.allergies?.items && feedback.allergies.items.length > 0) {
    score += 0.2;
    fieldCount++;
  }
  if (feedback.redFlags && feedback.redFlags.length > 0) {
    score += 0.15;
    fieldCount++;
  }

  // Higher score if multiple fields corrected
  if (fieldCount > 3) score += 0.15;

  return Math.min(score, 1.0);
}

export async function generateLearningSignal(
  originalSummary: NoteSummary,
  correctedSummary: NoteSummary,
  specialty: string,
): Promise<{
  pattern: string;
  severity: string;
  suggestion: string;
}> {
  // Identify what the model got wrong to prevent future errors

  const patterns: Array<{ pattern: string; severity: string; suggestion: string }> = [];

  // Check diagnoses
  const originalDiagnoses = new Set(originalSummary.activeProblems.map((p) => p.diagnosis));
  const correctedDiagnoses = new Set(correctedSummary.activeProblems.map((p) => p.diagnosis));

  if (originalDiagnoses.size !== correctedDiagnoses.size) {
    const missing = [...correctedDiagnoses].filter((d) => !originalDiagnoses.has(d));
    if (missing.length > 0) {
      patterns.push({
        pattern: `Missed diagnoses: ${missing.join(", ")}`,
        severity: missing.length > 2 ? "HIGH" : "MEDIUM",
        suggestion: `Improve ${specialty} diagnosis recognition for: ${missing.slice(0, 2).join(", ")}`,
      });
    }
  }

  // Check medications
  const originalMeds = new Set(
    originalSummary.currentMedications.items.map((m) => m.split(" ")[0].toLowerCase()),
  );
  const correctedMeds = new Set(
    correctedSummary.currentMedications.items.map((m) => m.split(" ")[0].toLowerCase()),
  );

  if (originalMeds.size !== correctedMeds.size) {
    const missing = [...correctedMeds].filter((m) => !originalMeds.has(m));
    if (missing.length > 0) {
      patterns.push({
        pattern: `Missed medications: ${missing.join(", ")}`,
        severity: "MEDIUM",
        suggestion: `Improve medication extraction for ${specialty}`,
      });
    }
  }

  // Check allergies
  if (
    originalSummary.allergies.items.length !==
    correctedSummary.allergies.items.length
  ) {
    patterns.push({
      pattern: "Incomplete allergy information",
      severity: "HIGH",
      suggestion: "Prioritize allergy extraction - critical for safety",
    });
  }

  return patterns[0] || {
    pattern: "General accuracy improvement",
    severity: "LOW",
    suggestion: "Continue monitoring extraction accuracy",
  };
}
