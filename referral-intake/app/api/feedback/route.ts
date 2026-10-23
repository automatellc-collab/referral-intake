import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { extractionFeedback } from "@/lib/db/schema";
import type { NoteSummary } from "@/lib/schema";

export async function POST(request: Request) {
  const { extractionId, originalData, correctedData, feedbackType, notes } = await request.json();

  if (!extractionId || !originalData || !correctedData) {
    return NextResponse.json(
      { error: "extractionId, originalData, and correctedData required" },
      { status: 400 },
    );
  }

  try {
    // Calculate which fields changed
    const changedFields: string[] = [];
    const original = originalData as Record<string, unknown>;
    const corrected = correctedData as Record<string, unknown>;

    for (const key in corrected) {
      if (JSON.stringify(original[key]) !== JSON.stringify(corrected[key])) {
        changedFields.push(key);
      }
    }

    await db.insert(extractionFeedback).values({
      extractionId,
      originalData: originalData as unknown as Record<string, unknown>,
      correctedData: correctedData as unknown as Record<string, unknown>,
      changedFields: changedFields as unknown as Record<string, unknown>,
      feedbackType: feedbackType || "correction",
      notes,
    });

    return NextResponse.json({
      success: true,
      message: "Feedback recorded",
      changedFields,
    });
  } catch (error) {
    console.error("Failed to store feedback:", error);
    return NextResponse.json({ error: "Failed to store feedback" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const extractionId = searchParams.get("extractionId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);

  try {
    let query = db.query.extractionFeedback.findMany({
      limit,
    });

    if (extractionId) {
      // Note: Drizzle doesn't support dynamic where in findMany the same way
      // This is a limitation we'd need to work around
      const allFeedback = await db.query.extractionFeedback.findMany({ limit });
      const filtered = allFeedback.filter(
        (f: any) => f.extractionId === parseInt(extractionId),
      );

      return NextResponse.json({
        feedback: filtered.map((f: any) => ({
          id: f.id,
          extractionId: f.extractionId,
          feedbackType: f.feedbackType,
          changedFields: f.changedFields,
          notes: f.notes,
          createdAt: f.createdAt,
        })),
      });
    }

    const allFeedback = await db.query.extractionFeedback.findMany({ limit });
    return NextResponse.json({
      feedback: allFeedback.map((f: any) => ({
        id: f.id,
        extractionId: f.extractionId,
        feedbackType: f.feedbackType,
        changedFields: f.changedFields,
        createdAt: f.createdAt,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch feedback:", error);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}
