/**
 * Pages through Twelve Data's 5000-bar-per-request cap (free tier) using
 * end_date to assemble ~1 year of 5-min candles, then runs the same
 * entryTypeFilter x maxHoldBars grid search as find-best-config.ts against
 * the larger sample.
 *
 * Usage: npx tsx scripts/backtest-full-year.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { runBacktest } from "../lib/backtest-engine";
import type { Candle, EntryTypeFilter, TradingSettings } from "../types/trading";

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
const TARGET_DAYS = 365;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

interface RawValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function toCandle(v: RawValue): Candle {
  return {
    timestamp: Date.parse(`${v.datetime.replace(" ", "T")}Z`),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseInt(v.volume, 10),
  };
}

async function fetchChunk(endDate: string | null): Promise<RawValue[]> {
  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "5min");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", API_KEY as string);
  if (endDate) {
    url.searchParams.set("end_date", endDate);
  }

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "error") {
    throw new Error(`Twelve Data error: ${json.message}`);
  }
  return json.values ?? [];
}

async function fetchFullYear(): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const startTime = Date.now();
  const cutoff = startTime - TARGET_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    console.log(`  Fetching chunk ${i + 1} (end_date=${endDate ?? "latest"})...`);
    const chunk = await fetchChunk(endDate);
    if (chunk.length === 0) break;

    allValues.push(...chunk);
    const oldest = chunk[chunk.length - 1].datetime;
    const oldestMs = Date.parse(`${oldest.replace(" ", "T")}Z`);

    if (oldestMs <= cutoff) break;

    const prevDay = new Date(oldestMs - 24 * 60 * 60 * 1000);
    endDate = prevDay.toISOString().slice(0, 10);

    // Stay comfortably under 8 req/min.
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (const v of allValues) {
    const c = toCandle(v);
    if (!seen.has(c.timestamp)) {
      seen.add(c.timestamp);
      candles.push(c);
    }
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

const HOLD_BAR_OPTIONS = [undefined, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30];
const FILTERS: EntryTypeFilter[] = ["ANY", "RETEST_ONLY", "FIBONACCI_ONLY"];

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const baseSettings: TradingSettings = settingsJson.data;

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles (this takes a minute, respecting rate limits)...\n`);
  const candles = await fetchFullYear();

  const spanDays = (candles[candles.length - 1].timestamp - candles[0].timestamp) / (24 * 60 * 60 * 1000);
  console.log(`\nAssembled ${candles.length} candles spanning ${spanDays.toFixed(0)} days`);
  console.log(`  from ${new Date(candles[0].timestamp).toISOString()}`);
  console.log(`  to   ${new Date(candles[candles.length - 1].timestamp).toISOString()}\n`);

  console.log(`Grid search (fibonacciAnchorMode=${baseSettings.fibonacciAnchorMode})\n`);
  console.log("filter".padEnd(16), "holdBars".padEnd(10), "trades".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(11), "avgPnl".padEnd(9), "maxDD");

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
        ("$" + result.totalPnl.toFixed(2)).padEnd(11),
        ("$" + result.avgProfitPerTrade.toFixed(2)).padEnd(9),
        result.maxDrawdownPct.toFixed(1) + "%",
      );
      if (result.totalTrades >= 20 && result.winRate > best.winRate) {
        best = { filter, bars: String(bars ?? "EOD"), winRate: result.winRate, totalPnl: result.totalPnl, trades: result.totalTrades };
      }
    }
  }

  console.log(
    `\nBest config (min 20 trades): entryTypeFilter=${best.filter}, holdBars=${best.bars} -> ` +
      `${best.winRate.toFixed(1)}% win rate, $${best.totalPnl.toFixed(2)} total P&L over ${best.trades} trades`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
