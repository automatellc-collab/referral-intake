import { NextResponse } from "next/server";
import { checkApiAuth } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { getSymbolSnapshot } from "@/lib/market-data";
import { detectOpeningTrend } from "@/lib/opening-trend-strategy";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol query param is required" }, { status: 400 });
  }

  try {
    const client = createMarketDataClientFromEnv();
    const snapshot = await getSymbolSnapshot(client, symbol);

    if (!snapshot.dataHealth.isLive) {
      return NextResponse.json({
        success: true,
        data: {
          status: "DATA_UNAVAILABLE",
          reason: `Market data is stale (${snapshot.dataHealth.staleSinceMinutes} min behind) — cannot reliably check for a signal.`,
        },
      });
    }

    const result = detectOpeningTrend(snapshot.todayCandles);

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        quote: snapshot.quote,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute opening-trend signal";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
