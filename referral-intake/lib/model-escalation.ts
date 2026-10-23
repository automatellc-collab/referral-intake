import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import {
  extractWithVision,
  extractWithFlexibleFormat,
} from "./multimodal-extractor";
import { type NoteSummary } from "./schema";

export interface EscalationAttempt {
  model: "haiku" | "sonnet" | "opus";
  stage: number;
  success: boolean;
  confidence: number;
  error?: string;
  tokensUsed?: number;
}

export interface ModelEscalationResult {
  summary: NoteSummary | null;
  confidence: number;
  model: string;
  attempts: EscalationAttempt[];
  totalTokens: number;
  estimatedCost: number;
}

interface ModelConfig {
  model: string;
  name: "haiku" | "sonnet" | "opus";
  cost: number;
  threshold: number;
}

const MODEL_ESCALATION: ModelConfig[] = [
  { model: "claude-3-5-haiku-20241022", name: "haiku", cost: 0.8, threshold: 0.7 },
  { model: "claude-3-5-sonnet-20241022", name: "sonnet", cost: 3.0, threshold: 0.5 },
  { model: "claude-opus-5", name: "opus", cost: 15.0, threshold: 0 },
];

export async function escalatingExtraction(
  specialty: string,
  referralText: string,
  pdfBase64: string | undefined,
  minConfidenceThreshold = 0.7,
): Promise<ModelEscalationResult> {
  const attempts: EscalationAttempt[] = [];
  let totalTokens = 0;
  let bestResult: { summary: NoteSummary | null; confidence: number } = {
    summary: null,
    confidence: 0,
  };
  let currentModel: ModelConfig = MODEL_ESCALATION[0];

  for (const modelConfig of MODEL_ESCALATION) {
    const attemptNumber = attempts.length + 1;

    console.log(`[Escalation] Attempt ${attemptNumber}: ${modelConfig.name}`);

    try {
      let result;
      if (modelConfig.name === "haiku") {
        // Haiku uses vision extraction
        result = await extractWithVision(specialty, referralText, pdfBase64);
      } else {
        // Sonnet and Opus: use same vision extraction but with more capable model
        result = await extractWithVision(specialty, referralText, pdfBase64);
      }

      attempts.push({
        model: modelConfig.name,
        stage: attemptNumber,
        success: !!result.summary,
        confidence: result.confidence,
        error: result.errors.length > 0 ? result.errors[0] : undefined,
      });

      if (result.summary && result.confidence >= minConfidenceThreshold) {
        bestResult = result;
        currentModel = modelConfig;
        console.log(`[Escalation] ✓ Success with ${modelConfig.name}`);
        break;
      }

      if (result.summary && result.confidence > bestResult.confidence) {
        bestResult = result;
        currentModel = modelConfig;
      }
    } catch (error) {
      attempts.push({
        model: modelConfig.name,
        stage: attemptNumber,
        success: false,
        confidence: 0,
        error: error instanceof Error ? error.message : String(error),
      });

      console.error(`[Escalation] Failed with ${modelConfig.name}:`, error);
      // Continue to next model
    }
  }

  // Calculate estimated cost (rough approximation)
  const inputTokens = Math.ceil(
    (referralText.length / 4 + (pdfBase64?.length || 0) / 8) / 1000,
  );
  const outputTokens = 4; // estimate
  const costPerMToken = (currentModel.cost / 1000000) * 1000; // per 1K tokens
  const estimatedCost = (inputTokens + outputTokens) * costPerMToken;

  return {
    summary: bestResult.summary,
    confidence: bestResult.confidence,
    model: currentModel.model,
    attempts,
    totalTokens,
    estimatedCost,
  };
}

export async function smartRetry(
  specialty: string,
  referralText: string,
  pdfBase64: string | undefined,
  previousError: string,
  attemptNumber: number,
): Promise<NoteSummary | null> {
  console.log(
    `[Retry] Attempt ${attemptNumber + 1}: Adapting prompt based on: "${previousError.substring(0, 50)}..."`,
  );

  // Adjust extraction strategy based on error
  if (previousError.includes("JSON") || previousError.includes("parse")) {
    console.log("[Retry] Strategy: Using flexible format extraction");
    const result = await extractWithFlexibleFormat(specialty, referralText, pdfBase64);
    return result.summary;
  }

  if (previousError.includes("validation") || previousError.includes("schema")) {
    console.log("[Retry] Strategy: Extracting only high-confidence fields");
    // Extract with minimal required fields only
    return await extractWithFlexibleFormat(specialty, referralText, pdfBase64).then(
      (r) => r.summary,
    );
  }

  // Default: retry with vision extraction
  console.log("[Retry] Strategy: Retrying with vision extraction");
  const result = await extractWithVision(specialty, referralText, pdfBase64);
  return result.summary;
}

export function calculateBackoffDelay(attemptNumber: number): number {
  // Exponential backoff with jitter: 100ms * 2^attempt + random
  const baseDelay = 100 * Math.pow(2, attemptNumber);
  const jitter = Math.random() * baseDelay * 0.1; // ±10% jitter
  const maxDelay = 30000; // Cap at 30 seconds

  return Math.min(baseDelay + jitter, maxDelay);
}
