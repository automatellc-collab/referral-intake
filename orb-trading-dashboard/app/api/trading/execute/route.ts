import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { createRobinhoodClientFromEnv } from "@/lib/robinhood-client";
import { getSymbolSnapshot } from "@/lib/market-data";
import { detectBreakout, getEntrySignal } from "@/lib/orb-strategy";
import { SettingsRepository } from "@/lib/repositories/settings-repository";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { executeEntrySignal } from "@/lib/trade-executor";

interface ExecuteRequestBody {
  symbol: string;
  accountEquity: number;
  profile?: string;
  // Optional: manual opening range override if automated fetch is incorrect.
  // Expects { high: number, low: number } in stock price units.
  overrideOpeningRange?: { high: number; low: number };
}

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const body = (await request.json()) as ExecuteRequestBody;
  const userId = resolveProfileId(body.profile);

  if (!body.symbol || !body.accountEquity) {
    return NextResponse.json(
      { success: false, error: "symbol and accountEquity are required" },
      { status: 400 },
    );
  }

  try {
    const dataClient = createMarketDataClientFromEnv();
    const snapshot = await getSymbolSnapshot(dataClient, body.symbol);
    const settings = new SettingsRepository().get(userId);

    // Distinguish "checked, nothing to do" from "couldn't actually check" —
    // conflating these hid a real incident (2026-08-28: Twelve Data had a
    // silent gap for the whole opening-range window, and the app reported
    // NO_SIGNAL as if it had genuinely looked and found nothing).
    if (!snapshot.dataHealth.isLive || !snapshot.dataHealth.openingRangeComplete) {
      return NextResponse.json({
        success: true,
        data: {
          status: "DATA_UNAVAILABLE",
          reason: !snapshot.dataHealth.isLive
            ? `Market data is stale (${snapshot.dataHealth.staleSinceMinutes} min behind) — cannot reliably check for a signal.`
            : "Today's opening-range candles are missing from the data feed — cannot compute the opening range.",
        },
      });
    }

    // Use manual override if provided, otherwise use auto-calculated range
    let openingRange = snapshot.openingRange;
    if (body.overrideOpeningRange) {
      const today = new Date().toLocaleDateString("en-CA");
      const latestCandle = snapshot.todayCandles[snapshot.todayCandles.length - 1];
      openingRange = {
        symbol: body.symbol,
        date: today,
        high: body.overrideOpeningRange.high,
        low: body.overrideOpeningRange.low,
        formedAt: latestCandle?.timestamp ?? Date.now(),
      };
      console.log(
        `[ORB] Using manual override for ${body.symbol}: HIGH ${body.overrideOpeningRange.high}, LOW ${body.overrideOpeningRange.low}`,
      );
    }

    if (!openingRange) {
      return NextResponse.json({ success: true, data: { status: "NO_SIGNAL" } });
    }

    const candlesAfterRange = snapshot.todayCandles.filter(
      (c) => c.timestamp > openingRange!.formedAt,
    );

    const breakout = candlesAfterRange.reduce<ReturnType<typeof detectBreakout>>((found, c) => {
      if (found) return found;
      return detectBreakout(openingRange!, c.close, c.timestamp);
    }, null);

    const entry = breakout ? getEntrySignal(breakout, candlesAfterRange, settings) : null;

    if (!entry) {
      return NextResponse.json({ success: true, data: { status: "NO_SIGNAL" } });
    }

    // AUTOMATED mode's order client is separate from the market-data client:
    // this app does not implement Robinhood order placement (see
    // lib/robinhood-client.ts), so executeEntrySignal will always return
    // BLOCKED for AUTOMATED mode with a clear reason.
    const result = await executeEntrySignal(
      {
        tradeRepo: new TradeRepository(),
        dailyStatsRepo: new DailyStatsRepository(),
        robinhoodClient: settings.mode === "AUTOMATED" ? createRobinhoodClientFromEnv() : undefined,
      },
      { userId, entry, settings, accountEquity: body.accountEquity },
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute signal";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
