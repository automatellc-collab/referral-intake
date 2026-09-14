/**
 * One-off analysis: replays today's actual candles through the live
 * strategy logic (both profile configs) to count how many distinct entry
 * points would have fired so far today, given the user asked to stop
 * live-firing signals but wanted a same-day recap.
 *
 * Usage: npx tsx scripts/todays-entry-points.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { getEasternDateString, hasOpeningRangeClosed } from "../lib/market-hours";
import { buildOpeningRange, detectBreakout, getEntrySignal } from "../lib/orb-strategy";
import type { Candle, EntrySignal, TradingSettings } from "../types/trading";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

loadEnvLocal();

const symbol = process.argv[2] ?? "SPY";

const PROFILES: Record<string, TradingSettings> = {
  default: {
    userId: "default",
    mode: "ALERTS",
    symbols: [symbol],
    dailyLossLimitPct: 2,
    riskPerTradePct: 1,
    maxOpenPositions: 1,
    riskRewardRatio: 3,
    stopLossBufferPct: 0,
    maxConsecutiveLosses: 3,
    maxTradePerOrderUsd: 8000,
    maxDailySpendUsd: 8000,
    fibonacciAnchorMode: "BREAKOUT_LEG",
    entryTypeFilter: "FIBONACCI_ONLY",
    maxHoldMinutes: 40,
  },
  "video-literal": {
    userId: "video-literal",
    mode: "ALERTS",
    symbols: [symbol],
    dailyLossLimitPct: 2,
    riskPerTradePct: 1,
    maxOpenPositions: 1,
    riskRewardRatio: 3,
    stopLossBufferPct: 0,
    maxConsecutiveLosses: 3,
    maxTradePerOrderUsd: 8000,
    maxDailySpendUsd: 8000,
    fibonacciAnchorMode: "OPENING_RANGE",
    entryTypeFilter: "ANY",
    maxHoldMinutes: 40,
  },
};

function fmtEt(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function main(): Promise<void> {
  const client = createMarketDataClientFromEnv();
  // 200 bars (not 100) so this still reaches back to 9:30 AM ET's opening
  // range candles when run well after market close, not just intraday.
  const recentCandles = await client.getHistoricals(symbol, "5min", 200);
  const now = Date.now();
  const today = getEasternDateString(now);
  const todayCandles = recentCandles
    .filter((c) => getEasternDateString(c.timestamp) === today)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!hasOpeningRangeClosed(now)) {
    console.log("Opening range hasn't closed yet today.");
    return;
  }

  const openingRange = buildOpeningRange(symbol, today, todayCandles);
  if (!openingRange) {
    console.log("No opening range data available for today.");
    return;
  }

  console.log(
    `Opening range (${symbol}, ${today}): high=${openingRange.high} low=${openingRange.low} formedAt=${fmtEt(openingRange.formedAt)} ET`,
  );

  const candlesAfterRange = todayCandles.filter((c) => c.timestamp > openingRange.formedAt);

  // Mirror the live route's logic exactly: first breakout of the day wins,
  // never re-evaluated against a later reversal.
  const breakout = candlesAfterRange.reduce<ReturnType<typeof detectBreakout>>((found, c) => {
    if (found) return found;
    return detectBreakout(openingRange, c.close, c.timestamp);
  }, null);

  if (!breakout) {
    console.log("No breakout has occurred yet today.");
    return;
  }

  console.log(
    `Breakout: ${breakout.direction} at ${breakout.breakoutPrice} (${fmtEt(breakout.breakoutAt)} ET)`,
  );
  console.log();

  for (const [profileName, settings] of Object.entries(PROFILES)) {
    console.log(`--- ${profileName} (entryTypeFilter=${settings.entryTypeFilter}, fibonacciAnchorMode=${settings.fibonacciAnchorMode}) ---`);

    let previousEntry: EntrySignal | null = null;
    const distinctEntries: EntrySignal[] = [];

    // Replay candle-by-candle, exactly as the live app would see it on
    // each poll: at each point in time, what does getEntrySignal say given
    // only the candles up to that point?
    for (let i = 0; i < candlesAfterRange.length; i++) {
      const candlesSoFar = candlesAfterRange.slice(0, i + 1);
      const entry = getEntrySignal(breakout, candlesSoFar, settings);

      const wasNone = previousEntry === null;
      const isNowSignal = entry !== null;
      const changedType = entry && previousEntry && entry.type !== previousEntry.type;

      if (isNowSignal && (wasNone || changedType)) {
        distinctEntries.push(entry as EntrySignal);
      }
      previousEntry = entry;
    }

    if (distinctEntries.length === 0) {
      console.log("  No entry points today.");
    } else {
      distinctEntries.forEach((e, idx) => {
        console.log(
          `  ${idx + 1}. ${e.type} entry @ ${fmtEt(e.detectedAt)} ET — price=${e.price.toFixed(2)} stop=${e.stopLoss.toFixed(2)} target=${e.takeProfit.toFixed(2)}`,
        );
      });
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
