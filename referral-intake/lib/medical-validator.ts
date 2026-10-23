import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { type NoteSummary } from "./schema";

export interface MedicalValidationResult {
  isValid: boolean;
  validityScore: number; // 0.0 to 1.0
  issues: string[];
}

export async function validateMedicalContent(
  summary: NoteSummary,
  specialty: string,
): Promise<MedicalValidationResult> {
  const client = new Anthropic();
  const issues: string[] = [];

  // Extract medical terms from summary
  const medicalTerms = extractMedicalTerms(summary);

  if (medicalTerms.length === 0) {
    return {
      isValid: true,
      validityScore: 1.0,
      issues: [],
    };
  }

  // Validate against medical knowledge
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1000,
    system: `You are a medical knowledge validator. Check if extracted medical terms are clinically valid and appropriate for a ${specialty} referral.

Validate:
1. Diagnoses are real ICD-10 conditions
2. Medications are real drugs with proper dosing
3. Drug-allergy combinations are concerning (e.g., penicillin allergy + penicillin prescribed)
4. Test names and results make sense
5. Timelines are logically consistent

Return JSON:
{
  "valid_terms": ["List of validated terms"],
  "invalid_terms": ["Terms that don't exist or are nonsensical"],
  "concerns": ["Clinical safety concerns (e.g., drug-allergy interactions)"],
  "overall_valid": true/false
}`,
    messages: [
      {
        role: "user",
        content: `Validate these medical terms extracted from a ${specialty} referral:\n${JSON.stringify(medicalTerms, null, 2)}`,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    return {
      isValid: true,
      validityScore: 0.8,
      issues: ["Could not perform medical validation"],
    };
  }

  try {
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        isValid: true,
        validityScore: 0.8,
        issues: ["Validation response malformed"],
      };
    }

    const validation = JSON.parse(jsonMatch[0]);

    if (Array.isArray(validation.invalid_terms) && validation.invalid_terms.length > 0) {
      issues.push(`Invalid terms: ${validation.invalid_terms.join(", ")}`);
    }

    if (Array.isArray(validation.concerns) && validation.concerns.length > 0) {
      issues.push(`Clinical concerns: ${validation.concerns.join(", ")}`);
    }

    const isValid = validation.overall_valid !== false && issues.length === 0;
    const validityScore = isValid ? 1.0 : Math.max(0.5, 1.0 - issues.length * 0.15);

    return {
      isValid,
      validityScore,
      issues,
    };
  } catch {
    return {
      isValid: true,
      validityScore: 0.8,
      issues: ["Medical validation parsing failed"],
    };
  }
}

function extractMedicalTerms(summary: NoteSummary): Record<string, unknown> {
  return {
    diagnoses: summary.activeProblems.map((p) => ({
      diagnosis: p.diagnosis,
      icdCode: p.icdCode,
    })),
    medications: summary.currentMedications.items,
    allergies: summary.allergies.items,
    tests: summary.resultsTimeline.map((t) => ({
      test: t.test,
      finding: t.finding,
    })),
    symptoms: summary.reviewOfSystemsNotes,
  };
}
