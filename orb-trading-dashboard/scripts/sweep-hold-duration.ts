/**
 * One-off analysis: fetches historicals once, then sweeps maxHoldBars
 * (how many 5-min candles a trade stays open before a forced TIME_EXIT)
 * to see how win rate and P&L change with shorter holds.
 *
 * Usage: npx tsx scripts/sweep-hold-duration.ts SPY [OPENING_RANGE|BREAKOUT_LEG]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { runBacktest } from "../lib/backtest-engine";
import type { FibonacciAnchorMode, TradingSettings } from "../types/trading";

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
const fibModeOverride = process.argv[3] as FibonacciAnchorMode | undefined;

const HOLD_BAR_OPTIONS = [1, 2, 3, 4, 6, 8, 10, 15, 20, 30, 40, 50, 60, 78];

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const settings: TradingSettings = {
    ...settingsJson.data,
    ...(fibModeOverride ? { fibonacciAnchorMode: fibModeOverride } : {}),
  };

  const client = createMarketDataClientFromEnv();
  const candles = await client.getHistoricals(symbol, "5min", 1690);

  console.log(`\nSweeping hold durations for ${symbol} (${candles.length} candles fetched, fib mode: ${settings.fibonacciAnchorMode})\n`);
  console.log("bars".padEnd(6), "minutes".padEnd(9), "trades".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(10), "avgPnl");

  let best = { bars: Infinity, winRate: -1, totalPnl: -Infinity };

  for (const bars of HOLD_BAR_OPTIONS) {
    const result = runBacktest({ symbol, candles, settings, startingEquity: 10000, maxHoldBars: bars });
    const minutes = bars * 5;
    console.log(
      String(bars).padEnd(6),
      String(minutes).padEnd(9),
      String(result.totalTrades).padEnd(8),
      (result.winRate.toFixed(1) + "%").padEnd(9),
      ("$" + result.totalPnl.toFixed(2)).padEnd(10),
      "$" + result.avgProfitPerTrade.toFixed(2),
    );
    if (result.winRate > best.winRate) {
      best = { bars, winRate: result.winRate, totalPnl: result.totalPnl };
    }
  }

  const endOfDay = runBacktest({ symbol, candles, settings, startingEquity: 10000 });
  console.log(
    "EOD".padEnd(6),
    "-".padEnd(9),
    String(endOfDay.totalTrades).padEnd(8),
    (endOfDay.winRate.toFixed(1) + "%").padEnd(9),
    ("$" + endOfDay.totalPnl.toFixed(2)).padEnd(10),
    "$" + endOfDay.avgProfitPerTrade.toFixed(2),
  );

  console.log(`\nBest win rate: ${best.winRate.toFixed(1)}% at ${best.bars} bars (${best.bars * 5} minutes), total P&L $${best.totalPnl.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
