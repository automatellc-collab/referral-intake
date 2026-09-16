import { NextResponse } from "next/server";
import { checkApiAuth } from "@/lib/api-auth";
import { checkExitSignal, type PositionState } from "@/lib/exit-strategy";

interface CheckExitBody {
  entryPrice: number;
  currentMark: number;
  peakMarkSinceEntry: number;
  isZeroDTE: boolean;
  entryTime: number;
  now?: number;
}

function isValidBody(body: unknown): body is CheckExitBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.entryPrice === "number" &&
    b.entryPrice > 0 &&
    typeof b.currentMark === "number" &&
    b.currentMark >= 0 &&
    typeof b.peakMarkSinceEntry === "number" &&
    b.peakMarkSinceEntry >= 0 &&
    typeof b.isZeroDTE === "boolean" &&
    typeof b.entryTime === "number"
  );
}

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const body = await request.json();

  if (!isValidBody(body)) {
    return NextResponse.json(
      { success: false, error: "entryPrice (>0), currentMark (>=0), peakMarkSinceEntry (>=0), isZeroDTE, and entryTime are required" },
      { status: 400 },
    );
  }

  const position: PositionState = {
    entryPrice: body.entryPrice,
    currentMark: body.currentMark,
    peakMarkSinceEntry: body.peakMarkSinceEntry,
    isZeroDTE: body.isZeroDTE,
    entryTime: body.entryTime,
    now: body.now ?? Date.now(),
  };

  const decision = checkExitSignal(position);

  return NextResponse.json({ success: true, data: decision });
}
