/**
 * One-off analysis: sweeps entryTypeFilter x maxHoldBars together to find
 * the actual best-known combination, rather than optimizing each dimension
 * independently.
 *
 * Usage: npx tsx scripts/find-best-config.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { runBacktest } from "../lib/backtest-engine";
import type { EntryTypeFilter, TradingSettings } from "../types/trading";

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
const HOLD_BAR_OPTIONS = [undefined, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30];
const FILTERS: EntryTypeFilter[] = ["ANY", "RETEST_ONLY", "FIBONACCI_ONLY"];

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const baseSettings: TradingSettings = settingsJson.data;

  const client = createMarketDataClientFromEnv();
  const candles = await client.getHistoricals(symbol, "5min", 1690);

  console.log(`\nFull grid search for ${symbol} (${candles.length} candles, fibonacciAnchorMode=${baseSettings.fibonacciAnchorMode})\n`);
  console.log("filter".padEnd(16), "holdBars".padEnd(10), "trades".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(10), "avgPnl");

  let best = { filter: "", bars: "EOD", winRate: -1, totalPnl: -Infinity, trades: 0 };

  for (const filter of FILTERS) {
    for (const bars of HOLD_BAR_OPTIONS) {
      const settings = { ...baseSettings, entryTypeFilter: filter };
      const result = runBacktest({ symbol, candles, settings, startingEquity: 10000, maxHoldBars: bars });
      console.log(
        filter.padEnd(16),
        String(bars ?? "EOD").padEnd(10),
        String(result.totalTrades).padEnd(8),
        (result.winRate.toFixed(1) + "%").padEnd(9),
        ("$" + result.totalPnl.toFixed(2)).padEnd(10),
        "$" + result.avgProfitPerTrade.toFixed(2),
      );
      // Require a minimum sample size so a 1-trade 100% win rate doesn't win by default.
      if (result.totalTrades >= 8 && result.winRate > best.winRate) {
        best = { filter, bars: String(bars ?? "EOD"), winRate: result.winRate, totalPnl: result.totalPnl, trades: result.totalTrades };
      }
    }
  }

  console.log(
    `\nBest config (min 8 trades): entryTypeFilter=${best.filter}, holdBars=${best.bars} -> ` +
      `${best.winRate.toFixed(1)}% win rate, $${best.totalPnl.toFixed(2)} total P&L over ${best.trades} trades`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
