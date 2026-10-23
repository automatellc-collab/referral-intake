/**
 * Backtest the exploratory FLAG entry type: a multi-candle (2-5 bar) tight
 * consolidation after the breakout candle (the "flagpole"), confirmed only
 * once price closes beyond the flag's high/low in the trend direction.
 * Generalizes CONTINUATION's single-candle pullback into a proper flag.
 *
 * Usage: npx tsx scripts/backtest-flag.ts [SYMBOL]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { runBacktest } from "../lib/backtest-engine";
import type { Candle, TradingSettings } from "../types/trading";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const symbol = process.argv[2] ?? "SPY";
const TARGET_DAYS = 365;
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const HOLD_BAR_OPTIONS = [undefined, 1, 2, 3, 4, 6, 8, 10, 15, 20, 30];

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
  if (endDate) url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "error") throw new Error(`Twelve Data error: ${json.message}`);
  return json.values ?? [];
}

async function fetchFullYear(): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const cutoff = Date.now() - TARGET_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    console.log(`  Fetching chunk ${i + 1} (end_date=${endDate ?? "latest"})...`);
    const chunk = await fetchChunk(endDate);
    if (chunk.length === 0) break;
    allValues.push(...chunk);
    const oldest = chunk[chunk.length - 1].datetime;
    const oldestMs = Date.parse(`${oldest.replace(" ", "T")}Z`);
    if (oldestMs <= cutoff) break;
    endDate = new Date(oldestMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await new Promise((r) => setTimeout(r, 8000));
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

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const baseSettings: TradingSettings = (await settingsRes.json()).data;

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...\n`);
  const candles = await fetchFullYear();
  console.log(`\nAssembled ${candles.length} candles\n`);

  console.log(`=== ${symbol} (FLAG_ONLY, exploratory) ===`);
  console.log("holdBars".padEnd(10), "trades".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(11), "avgPnl".padEnd(9), "maxDD");

  let best = { bars: "EOD", winRate: -1, totalPnl: -Infinity, trades: 0 };
  for (const bars of HOLD_BAR_OPTIONS) {
    const settings = { ...baseSettings, entryTypeFilter: "FLAG_ONLY" as const };
    const result = runBacktest({ symbol, candles, settings, startingEquity: 10000, maxHoldBars: bars });
    console.log(
      String(bars ?? "EOD").padEnd(10),
      String(result.totalTrades).padEnd(8),
      (result.winRate.toFixed(1) + "%").padEnd(9),
      ("$" + result.totalPnl.toFixed(2)).padEnd(11),
      ("$" + result.avgProfitPerTrade.toFixed(2)).padEnd(9),
      result.maxDrawdownPct.toFixed(1) + "%",
    );
    if (result.totalTrades >= 15 && result.totalPnl > best.totalPnl) {
      best = { bars: String(bars ?? "EOD"), winRate: result.winRate, totalPnl: result.totalPnl, trades: result.totalTrades };
    }
  }
  console.log(`\nBest for ${symbol}: holdBars=${best.bars} -> ${best.winRate.toFixed(1)}% WR, $${best.totalPnl.toFixed(2)} total P&L over ${best.trades} trades`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
