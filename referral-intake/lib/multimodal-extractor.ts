import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { type NoteSummary, NoteSummarySchema } from "@/lib/schema";

export interface MultimodalExtractionResult {
  summary: NoteSummary | null;
  confidence: number;
  method: "structured" | "flexible" | "vision-first";
  errors: string[];
  recoveryAttempts: number;
}

const VISION_EXTRACTION_PROMPT = (specialty: string) => `
You are a clinical intake assistant analyzing a ${specialty} referral document.

Extract clinical information using BOTH:
1. Text content and meaning
2. Visual layout (form fields, tables, organized sections)

Return this exact JSON structure:
{
  "openingNarrative": {
    "status": "extracted" | "inferred" | "missing",
    "value": "Single paragraph in dictation style"
  },
  "urgency": {
    "level": "Routine" | "Urgent" | "STAT",
    "rationale": "One sentence with quoted trigger language"
  },
  "resultsTimeline": [
    { "date": "YYYY-MM-DD or as written", "test": "Test name", "finding": "Result" }
  ],
  "reviewOfSystemsNotes": ["Explicit symptoms from document"],
  "medicalHistory": ["Past medical conditions"],
  "activeProblems": [
    { "diagnosis": "Condition name", "icdCode": "ICD-10 if explicit, else empty" }
  ],
  "surgicalHistory": ["Past surgeries"],
  "currentMedications": {
    "status": "extracted" | "inferred" | "missing",
    "items": ["Medication dose format"]
  },
  "allergies": {
    "status": "extracted" | "inferred" | "missing",
    "items": ["Drug: reaction type"]
  },
  "socialHistoryNotes": ["Smoking, occupation, relevant social factors"],
  "redFlags": [
    { "term": "Finding", "context": "Where it appeared in document" }
  ],
  "gaps": ["Expected ${specialty} information that is missing"]
}

CRITICAL: Extract only facts explicitly present. Mark status as "inferred" only for obvious context-based deductions.
Return ONLY valid JSON, no markdown.
`;

export async function extractWithVision(
  specialty: string,
  referralText: string,
  pdfBase64?: string,
): Promise<MultimodalExtractionResult> {
  const client = new Anthropic();
  const errors: string[] = [];
  let recoveryAttempts = 0;

  // Build message content with text + optional vision
  const content: Anthropic.ContentBlockParam[] = [];

  if (pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    });
  }

  content.push({
    type: "text",
    text: `${VISION_EXTRACTION_PROMPT(specialty)}\n\nDocument text:\n${referralText || "(No text content)"}`,
  });

  try {
    // Strategy 1: Structured extraction with vision
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from vision extraction");
    }

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      errors.push("No JSON found in response");
      throw new Error("No JSON in response");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      errors.push(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
      throw new Error("JSON parse failed");
    }

    // Validate schema
    try {
      const summary = NoteSummarySchema.parse(parsed);
      return {
        summary,
        confidence: 0.95,
        method: "structured",
        errors,
        recoveryAttempts,
      };
    } catch (validationError) {
      errors.push(
        `Validation: ${validationError instanceof Error ? validationError.message : String(validationError)}`,
      );
      throw new Error("Schema validation failed");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    // Return null summary; orchestrator will try fallback
    return {
      summary: null,
      confidence: 0,
      method: "vision-first",
      errors,
      recoveryAttempts,
    };
  }
}

export async function extractWithFlexibleFormat(
  specialty: string,
  referralText: string,
  pdfBase64?: string,
): Promise<MultimodalExtractionResult> {
  const client = new Anthropic();
  const errors: string[] = [];

  const content: Anthropic.ContentBlockParam[] = [];

  if (pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    });
  }

  content.push({
    type: "text",
    text: `Extract clinical information from this ${specialty} referral in any valid JSON format.
Include: patient age, referring doctor, reason for referral, symptoms, medical history, medications, allergies, test results, assessment.

Document: ${referralText || "(See attached PDF)"}`,
  });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      errors.push("No text response");
      return { summary: null, confidence: 0, method: "flexible", errors, recoveryAttempts: 1 };
    }

    // Try to map flexible JSON to NoteSummary
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      errors.push("No JSON in flexible response");
      return { summary: null, confidence: 0, method: "flexible", errors, recoveryAttempts: 1 };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const mapped = mapFlexibleToSchema(parsed, specialty);

    try {
      const summary = NoteSummarySchema.parse(mapped);
      return {
        summary,
        confidence: 0.75,
        method: "flexible",
        errors,
        recoveryAttempts: 1,
      };
    } catch (e) {
      errors.push(`Fallback mapping failed: ${e instanceof Error ? e.message : String(e)}`);
      return { summary: null, confidence: 0, method: "flexible", errors, recoveryAttempts: 1 };
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { summary: null, confidence: 0, method: "flexible", errors, recoveryAttempts: 1 };
  }
}

function mapFlexibleToSchema(flexible: unknown, specialty: string): unknown {
  if (typeof flexible !== "object" || !flexible) return {};

  const obj = flexible as Record<string, unknown>;

  return {
    openingNarrative: {
      status: "inferred",
      value: obj.summary || obj.hpi || obj.narrative || "",
    },
    urgency: {
      level: "Routine",
      rationale: "Extracted from referral content",
    },
    resultsTimeline: Array.isArray(obj.results) ? obj.results : [],
    reviewOfSystemsNotes: Array.isArray(obj.ros) ? obj.ros : [],
    medicalHistory: Array.isArray(obj.history) ? obj.history : [],
    activeProblems: Array.isArray(obj.problems)
      ? obj.problems.map((p: unknown) =>
          typeof p === "string" ? { diagnosis: p, icdCode: "" } : p,
        )
      : [],
    surgicalHistory: Array.isArray(obj.surgeries) ? obj.surgeries : [],
    currentMedications: {
      status: "inferred",
      items: Array.isArray(obj.medications) ? obj.medications : [],
    },
    allergies: {
      status: "inferred",
      items: Array.isArray(obj.allergies) ? obj.allergies : [],
    },
    socialHistoryNotes: Array.isArray(obj.social) ? obj.social : [],
    redFlags: [],
    gaps: [],
  };
}
