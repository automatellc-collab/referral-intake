/**
 * One-off analysis: breaks down backtest win rate by entry type
 * (RETEST vs FIBONACCI) to see whether the Fibonacci fallback entries are
 * actually good trades, or just adding noise.
 *
 * Usage: npx tsx scripts/breakdown-by-entry-type.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { runBacktest, type BacktestTradeResult } from "../lib/backtest-engine";
import type { TradingSettings } from "../types/trading";

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

function printStats(label: string, trades: BacktestTradeResult[]): void {
  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.length - wins;
  const total = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const avg = trades.length ? total / trades.length : 0;

  console.log(
    `${label}: ${trades.length} trades, ${wins}W/${losses}L, win rate ${winRate.toFixed(1)}%, ` +
      `total P&L $${total.toFixed(2)}, avg P&L $${avg.toFixed(2)}`,
  );
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const settings: TradingSettings = settingsJson.data;

  const client = createMarketDataClientFromEnv();
  const candles = await client.getHistoricals(symbol, "5min", 1690);
  const result = runBacktest({ symbol, candles, settings, startingEquity: 10000 });

  const retestTrades = result.trades.filter((t) => t.entryType === "RETEST");
  const fibTrades = result.trades.filter((t) => t.entryType === "FIBONACCI");

  console.log(`\nLive settings: fibonacciAnchorMode=${settings.fibonacciAnchorMode}, symbol=${symbol}\n`);
  printStats("ALL TRADES", result.trades);
  printStats("RETEST only", retestTrades);
  printStats("FIBONACCI only", fibTrades);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
