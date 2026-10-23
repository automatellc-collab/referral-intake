import { NextResponse } from "next/server";
import { getReviewQueueStats } from "@/lib/db/storage";
import { getExtractionMetrics } from "@/lib/analytics";

export async function GET() {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Check queue status
    const queueStats = await getReviewQueueStats();

    // Check 24h metrics
    const metrics24h = await getExtractionMetrics(oneDayAgo, now);

    const status =
      metrics24h.successRate > 0.9 && queueStats.critical === 0 ? "healthy" : "degraded";

    return NextResponse.json({
      status,
      timestamp: now.toISOString(),
      services: {
        database: "online",
        extraction: metrics24h.successRate > 0.8 ? "online" : "degraded",
        review_queue: queueStats.pending > 100 ? "degraded" : "online",
      },
      metrics: {
        successRate24h: (metrics24h.successRate * 100).toFixed(1) + "%",
        extractionsLast24h: metrics24h.totalCount,
        reviewQueuePending: queueStats.pending,
        reviewQueueCritical: queueStats.critical,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}
