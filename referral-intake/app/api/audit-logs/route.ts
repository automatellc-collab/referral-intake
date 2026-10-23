import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const specialty = searchParams.get("specialty");
  const model = searchParams.get("model");
  const successOnly = searchParams.get("successOnly") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 1000);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    let logs = await db.query.auditLog.findMany({
      limit,
      offset,
      orderBy: [desc(auditLog.createdAt)],
    });

    // Client-side filtering (in production, use proper Drizzle where clauses)
    if (specialty) {
      logs = logs.filter((l: any) => l.specialty === specialty);
    }
    if (model) {
      logs = logs.filter((l: any) => l.model === model);
    }
    if (successOnly) {
      logs = logs.filter((l: any) => l.success);
    }

    return NextResponse.json({
      logs: logs.map((log: any) => ({
        id: log.id,
        requestId: log.requestId,
        specialty: log.specialty,
        documentType: log.documentType,
        model: log.model,
        extractionMethod: log.extractionMethod,
        success: log.success,
        confidence: log.confidence ? parseFloat(log.confidence) : null,
        latencyMs: log.latencyMs,
        estimatedCost: log.estimatedCost ? parseFloat(log.estimatedCost) : null,
        retryCount: log.retryCount,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt,
      })),
      pagination: {
        limit,
        offset,
        total: logs.length,
      },
    });
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
  }
}
