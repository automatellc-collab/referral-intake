import "server-only";

import { createHash } from "crypto";
import { db } from "./client";
import { extractionCache, auditLog, reviewQueue } from "./schema";
import { eq } from "drizzle-orm";
import type { NoteSummary } from "@/lib/schema";

export async function cacheExtraction(params: {
  content: string;
  specialty: string;
  documentType: string;
  summary: NoteSummary;
  confidence: number;
  extractionMethod: string;
  requiresReview: boolean;
}): Promise<void> {
  const contentHash = createHash("sha256").update(params.content).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  try {
    await db.insert(extractionCache).values({
      contentHash,
      specialty: params.specialty,
      documentType: params.documentType,
      summary: params.summary as unknown as Record<string, unknown>,
      confidence: params.confidence.toString(),
      extractionMethod: params.extractionMethod,
      requiresReview: params.requiresReview,
      expiresAt,
    });
  } catch (error) {
    console.error("Failed to cache extraction:", error);
    // Non-blocking: don't fail extraction if cache fails
  }
}

export async function getCachedExtraction(content: string): Promise<{
  summary: NoteSummary;
  confidence: number;
  documentType: string;
} | null> {
  const contentHash = createHash("sha256").update(content).digest("hex");

  try {
    const result = await db.query.extractionCache.findFirst({
      where: eq(extractionCache.contentHash, contentHash),
    });

    if (!result) return null;

    return {
      summary: result.summary as NoteSummary,
      confidence: parseFloat(result.confidence),
      documentType: result.documentType,
    };
  } catch (error) {
    console.error("Failed to retrieve cached extraction:", error);
    return null;
  }
}

export async function logAudit(params: {
  requestId: string;
  input: string;
  specialty: string;
  documentType?: string;
  model: string;
  extractionMethod: string;
  success: boolean;
  confidence?: number;
  tokensUsed?: number;
  estimatedCost?: number;
  latencyMs: number;
  errorMessage?: string;
  retryCount: number;
}): Promise<void> {
  const inputHash = createHash("sha256").update(params.input).digest("hex");

  try {
    await db.insert(auditLog).values({
      requestId: params.requestId,
      inputHash,
      specialty: params.specialty,
      documentType: params.documentType,
      model: params.model,
      extractionMethod: params.extractionMethod,
      success: params.success,
      confidence: params.confidence?.toString(),
      tokensUsed: params.tokensUsed,
      estimatedCost: params.estimatedCost?.toString(),
      latencyMs: params.latencyMs,
      errorMessage: params.errorMessage,
      retryCount: params.retryCount,
    });
  } catch (error) {
    console.error("Failed to log audit:", error);
    // Non-blocking
  }
}

export async function addToReviewQueue(params: {
  extractionId: number;
  reason: string;
  priority: "critical" | "urgent" | "standard";
}): Promise<void> {
  try {
    await db.insert(reviewQueue).values({
      extractionId: params.extractionId,
      reason: params.reason,
      priority: params.priority,
      status: "pending",
    });
  } catch (error) {
    console.error("Failed to add to review queue:", error);
  }
}

export async function getReviewQueueStats(): Promise<{
  pending: number;
  inReview: number;
  critical: number;
}> {
  try {
    const results = await db.query.reviewQueue.findMany();

    return {
      pending: results.filter((r) => r.status === "pending").length,
      inReview: results.filter((r) => r.status === "in_review").length,
      critical: results.filter((r) => r.priority === "critical").length,
    };
  } catch (error) {
    console.error("Failed to get review queue stats:", error);
    return { pending: 0, inReview: 0, critical: 0 };
  }
}

export async function cleanupExpiredCache(): Promise<number> {
  try {
    const result = await db
      .delete(extractionCache)
      .where(extractionCache.expiresAt < new Date())
      .returning();

    return result.length;
  } catch (error) {
    console.error("Failed to cleanup expired cache:", error);
    return 0;
  }
}
