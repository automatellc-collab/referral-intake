import "server-only";

import Anthropic from "@anthropic-ai/sdk";

export type DocumentType =
  | "referral-letter"
  | "lab-results"
  | "imaging-report"
  | "clinical-notes"
  | "patient-summary"
  | "mixed"
  | "unknown";

export interface ClassificationResult {
  type: DocumentType;
  confidence: number;
  reasoning: string;
}

export async function classifyDocument(
  content: string,
  filename: string,
): Promise<ClassificationResult> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 500,
    system: `You are a medical document classifier. Analyze the document and return JSON with:
{
  "type": "referral-letter" | "lab-results" | "imaging-report" | "clinical-notes" | "patient-summary" | "mixed" | "unknown",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of classification"
}

Classify based on:
- referral-letter: Request for specialist evaluation, includes patient info and reason for referral
- lab-results: Laboratory test results, values, reference ranges
- imaging-report: Radiology/imaging findings and impressions
- clinical-notes: Physician notes from visits, assessments, plans
- patient-summary: Overview of patient status and history
- mixed: Contains multiple document types
- unknown: Cannot classify

Return only valid JSON.`,
    messages: [
      {
        role: "user",
        content: `Filename: ${filename}\n\nContent:\n${content.substring(0, 2000)}`,
      },
    ],
  });

  const textContent = response.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    return {
      type: "unknown",
      confidence: 0,
      reasoning: "Failed to classify document",
    };
  }

  try {
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      type: parsed.type || "unknown",
      confidence: parsed.confidence || 0,
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return {
      type: "unknown",
      confidence: 0,
      reasoning: "Classification parsing failed",
    };
  }
}
