import { NextResponse } from "next/server";
import { getExtractionMetrics, generateAnalyticsSummary } from "@/lib/analytics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get("days") || "7"), 90);
  const format = searchParams.get("format") || "json";

  try {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

    const metrics = await getExtractionMetrics(startDate, endDate);

    if (format === "text") {
      const summary = await generateAnalyticsSummary(startDate, endDate);
      return new NextResponse(summary, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    return NextResponse.json({
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        days,
      },
      metrics: {
        total: metrics.totalCount,
        successRate: (metrics.successRate * 100).toFixed(1) + "%",
        avgConfidence: (metrics.avgConfidence * 100).toFixed(1) + "%",
        avgLatencyMs: metrics.avgLatencyMs.toFixed(0),
        totalCost: "$" + metrics.totalCost.toFixed(2),
      },
      bySpecialty: Object.entries(metrics.bySpecialty).map(([specialty, stat]) => ({
        specialty,
        count: stat.count,
        successRate: (stat.successRate * 100).toFixed(1) + "%",
        avgConfidence: (stat.avgConfidence * 100).toFixed(1) + "%",
      })),
      byModel: Object.entries(metrics.byModel).map(([model, stat]) => ({
        model,
        usage: stat.usage,
        successRate: (stat.successRate * 100).toFixed(1) + "%",
        costPerExtraction: "$" + stat.costPerExtraction.toFixed(4),
      })),
      byFormat: Object.entries(metrics.byFormat).map(([format, stat]) => ({
        format,
        count: stat.count,
        successRate: (stat.successRate * 100).toFixed(1) + "%",
      })),
    });
  } catch (error) {
    console.error("Failed to generate analytics:", error);
    return NextResponse.json({ error: "Failed to generate analytics" }, { status: 500 });
  }
}
