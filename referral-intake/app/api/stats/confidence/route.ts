import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { and, gt, isNotNull } from "drizzle-orm";

export async function GET() {
  try {
    // Calculate average confidence from successful extractions with confidence data
    const results = await db.query.auditLog.findMany({
      where: and(
        isNotNull(auditLog.confidence),
        gt(auditLog.latencyMs, 0) // Only count completed extractions
      ),
    });

    if (results.length === 0) {
      return NextResponse.json({
        success: true,
        confidence: 76, // Default fallback if no data
        count: 0,
        message: "No extraction data available, using default",
      });
    }

    const confidences = results
      .map((r) => (r.confidence ? parseFloat(r.confidence.toString()) : null))
      .filter((c) => c !== null) as number[];

    if (confidences.length === 0) {
      return NextResponse.json({
        success: true,
        confidence: 76,
        count: 0,
        message: "No confidence scores recorded",
      });
    }

    const avgConfidence =
      confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const roundedConfidence = Math.round(avgConfidence);

    return NextResponse.json({
      success: true,
      confidence: roundedConfidence,
      count: confidences.length,
      min: Math.min(...confidences),
      max: Math.max(...confidences),
    });
  } catch (error) {
    console.error("Failed to calculate confidence:", error);
    return NextResponse.json(
      { success: false, confidence: 76, error: "Failed to fetch confidence data" },
      { status: 500 }
    );
  }
}
