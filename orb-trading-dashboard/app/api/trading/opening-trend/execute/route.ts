import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { createRobinhoodClientFromEnv } from "@/lib/robinhood-client";
import { getSymbolSnapshot } from "@/lib/market-data";
import { detectOpeningTrend, getOpeningTrendEntrySignal } from "@/lib/opening-trend-strategy";
import { SettingsRepository } from "@/lib/repositories/settings-repository";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { executeEntrySignal } from "@/lib/trade-executor";
import { calculateSignalFreshness } from "@/lib/signal-freshness";

interface ExecuteRequestBody {
  symbol: string;
  accountEquity: number;
  profile?: string;
}

// Independent strategy from ORB (see lib/opening-trend-strategy.ts) — its
// own signal path, its own profile namespace (defaults to
// "opening-trend"), so it never shares open-position/daily-loss state with
// ORB's "default"/"video-literal" profiles.
export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const body = (await request.json()) as ExecuteRequestBody;
  const userId = resolveProfileId(body.profile ?? "opening-trend");

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
    const entry = getOpeningTrendEntrySignal(result, body.symbol);

    if (!entry) {
      return NextResponse.json({ success: true, data: { status: "NO_SIGNAL", openingTrend: result } });
    }

    const execResult = await executeEntrySignal(
      {
        tradeRepo: new TradeRepository(),
        dailyStatsRepo: new DailyStatsRepository(),
        robinhoodClient: settings.mode === "AUTOMATED" ? createRobinhoodClientFromEnv() : undefined,
      },
      { userId, entry, settings, accountEquity: body.accountEquity },
    );

    const freshness =
      execResult.status === "ALERTED"
        ? calculateSignalFreshness(entry, snapshot.quote.price, Date.now())
        : undefined;

    return NextResponse.json({
      success: true,
      data: { ...execResult, ...(freshness && { freshness }), openingTrend: result },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to execute opening-trend signal";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
