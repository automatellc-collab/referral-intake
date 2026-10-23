import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { reviewQueue, extractionCache } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "pending";
  const priority = searchParams.get("priority");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    const conditions = [eq(reviewQueue.status, status)];
    if (priority) {
      conditions.push(eq(reviewQueue.priority, priority));
    }

    const items = await db.query.reviewQueue.findMany({
      where: and(...conditions),
      limit,
      offset,
      orderBy: (fields: any) => [fields.priority, fields.createdAt],
    });

    const total = items.length;

    return NextResponse.json({
      items: items.map((item: any) => ({
        id: item.id,
        extractionId: item.extractionId,
        status: item.status,
        priority: item.priority,
        reason: item.reason,
        createdAt: item.createdAt,
        notes: item.notes,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: total === limit,
      },
    });
  } catch (error) {
    console.error("Failed to fetch review queue:", error);
    return NextResponse.json({ error: "Failed to fetch review queue" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { id, status, notes } = await request.json();

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  try {
    await db
      .update(reviewQueue)
      .set({ status, notes, updatedAt: new Date() })
      .where(eq(reviewQueue.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update review queue:", error);
    return NextResponse.json({ error: "Failed to update queue item" }, { status: 500 });
  }
}
