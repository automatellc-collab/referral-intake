/**
 * One-off analysis: fetches historicals once, then compares the two
 * Fibonacci anchor interpretations (OPENING_RANGE vs BREAKOUT_LEG) against
 * the same data to see which one actually performs better.
 *
 * Usage: npx tsx scripts/compare-fib-modes.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { runBacktest } from "../lib/backtest-engine";
import type { TradingSettings, FibonacciAnchorMode } from "../types/trading";

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

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const baseSettings: TradingSettings = settingsJson.data;

  const client = createMarketDataClientFromEnv();
  const candles = await client.getHistoricals(symbol, "5min", 1690);

  console.log(`\nComparing Fibonacci anchor modes for ${symbol} (${candles.length} candles)\n`);

  const modes: FibonacciAnchorMode[] = ["OPENING_RANGE", "BREAKOUT_LEG"];
  const results: Record<string, ReturnType<typeof runBacktest>> = {};

  for (const mode of modes) {
    const settings = { ...baseSettings, fibonacciAnchorMode: mode };
    const result = runBacktest({ symbol, candles, settings, startingEquity: 10000 });
    results[mode] = result;

    console.log(`${mode}:`);
    console.log(`  Total trades: ${result.totalTrades} (${result.wins}W / ${result.losses}L)`);
    console.log(`  Win rate: ${result.winRate.toFixed(1)}%`);
    console.log(`  Total P&L: $${result.totalPnl.toFixed(2)}`);
    console.log(`  Max drawdown: ${result.maxDrawdownPct.toFixed(1)}%`);

    const fibTrades = result.trades.filter((t) => t.entryType === "FIBONACCI");
    console.log(`  Fibonacci entries used: ${fibTrades.length} of ${result.totalTrades}`);
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
