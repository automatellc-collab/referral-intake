import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { getSymbolSnapshot } from "@/lib/market-data";
import { findQualifyingBreakout, getEntrySignal } from "@/lib/orb-strategy";
import { SettingsRepository } from "@/lib/repositories/settings-repository";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const userId = resolveProfileId(searchParams.get("profile"));

  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol query param is required" }, { status: 400 });
  }

  try {
    const client = createMarketDataClientFromEnv();
    const snapshot = await getSymbolSnapshot(client, symbol);
    const settings = new SettingsRepository().get(userId);

    // Distinguish "checked, nothing to do" from "couldn't actually check" —
    // conflating these hid a real incident (2026-08-28: Twelve Data had a
    // silent gap for the whole opening-range window, and the app reported
    // an empty signal as if it had genuinely looked and found nothing).
    if (!snapshot.dataHealth.isLive || !snapshot.dataHealth.openingRangeComplete) {
      return NextResponse.json({
        success: true,
        data: {
          status: "DATA_UNAVAILABLE",
          reason: !snapshot.dataHealth.isLive
            ? `Market data is stale (${snapshot.dataHealth.staleSinceMinutes} min behind) — cannot reliably check for a signal.`
            : "Today's opening-range candles are missing from the data feed — cannot compute the opening range.",
          dataHealth: snapshot.dataHealth,
          openingRange: null,
          breakout: null,
          entry: null,
          quote: snapshot.quote,
          candles: snapshot.todayCandles,
        },
      });
    }

    if (!snapshot.openingRange) {
      return NextResponse.json({
        success: true,
        data: {
          status: "NO_SIGNAL",
          dataHealth: snapshot.dataHealth,
          openingRange: null,
          breakout: null,
          entry: null,
          quote: snapshot.quote,
          candles: snapshot.todayCandles,
        },
      });
    }

    const candlesAfterRange = snapshot.todayCandles.filter(
      (c) => c.timestamp > snapshot.openingRange!.formedAt,
    );

    const breakout = findQualifyingBreakout(
      snapshot.todayCandles,
      snapshot.openingRange,
      settings,
      snapshot.levelContext,
    );

    const entry = breakout ? getEntrySignal(breakout, candlesAfterRange, settings) : null;

    return NextResponse.json({
      success: true,
      data: {
        status: entry ? "SIGNAL" : "NO_SIGNAL",
        dataHealth: snapshot.dataHealth,
        openingRange: snapshot.openingRange,
        breakout,
        entry,
        quote: snapshot.quote,
        candles: snapshot.todayCandles,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to compute signal";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
