/**
 * Council question (2026-09-23): does a FIBONACCI_ONLY entry whose
 * retracement zone extends back into/through the opening range (not just a
 * shallow pullback from the post-breakout swing high) underperform a
 * shallow retracement that stays entirely beyond the opening range?
 *
 * Prompted by a live trade: QQQ's Fib entry fired at a retracement that ate
 * the whole opening range and kept falling instead of bouncing. This splits
 * historical FIBONACCI_ONLY trades into "shallow" (zone entirely beyond the
 * opening range) vs "deep" (zone overlaps/extends past the opening range)
 * and compares win rate / P&L per bucket, using the existing entry/exit
 * logic unchanged — this is pure analysis, no strategy change.
 *
 * Usage: npx tsx scripts/backtest-fib-retracement-depth.ts [SYMBOL]
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildOpeningRange,
  detectBreakout,
  getEntrySignal,
  getFibonacciAnchors,
} from "../lib/orb-strategy";
import { calculateFibonacciLevels } from "../lib/fibonacci";
import { simulateExit } from "../lib/backtest-engine";
import { calculatePositionSize } from "../lib/risk-calculator";
import { getEasternDateString } from "../lib/market-hours";
import type { Candle, ORBSignal, TradingSettings } from "../types/trading";

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
const MAX_HOLD_BARS = 10; // SPY's own backtested best hold; kept fixed so the split isn't confounded by hold-time.

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

function groupByEasternDate(candles: Candle[]): Map<string, Candle[]> {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const groups = new Map<string, Candle[]>();
  for (const c of sorted) {
    const date = getEasternDateString(c.timestamp);
    const arr = groups.get(date) ?? [];
    arr.push(c);
    groups.set(date, arr);
  }
  return groups;
}

function findFirstBreakout(
  postRangeCandles: Candle[],
  openingRange: NonNullable<ReturnType<typeof buildOpeningRange>>,
): { signal: ORBSignal; breakoutIndex: number } | null {
  for (let i = 0; i < postRangeCandles.length; i++) {
    const signal = detectBreakout(openingRange, postRangeCandles[i].close, postRangeCandles[i].timestamp);
    if (signal) return { signal, breakoutIndex: i };
  }
  return null;
}

interface Bucket {
  trades: number;
  wins: number;
  totalPnl: number;
}

function emptyBucket(): Bucket {
  return { trades: 0, wins: 0, totalPnl: 0 };
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const baseSettings: TradingSettings = (await settingsRes.json()).data;
  const settings = { ...baseSettings, entryTypeFilter: "FIBONACCI_ONLY" as const };

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...`);
  const candles = await fetchFullYear();
  console.log(`Assembled ${candles.length} candles\n`);

  const dayGroups = groupByEasternDate(candles);
  const shallow = emptyBucket();
  const deep = emptyBucket();
  let runningEquity = 10000;

  for (const [date, dayCandles] of dayGroups) {
    const openingRange = buildOpeningRange(symbol, date, dayCandles);
    if (!openingRange) continue;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    const breakout = findFirstBreakout(postRangeCandles, openingRange);
    if (!breakout) continue;

    const candlesSinceBreakout: Candle[] = [];
    let entry: NonNullable<ReturnType<typeof getEntrySignal>> | null = null;
    let entryIndex = -1;

    for (let i = breakout.breakoutIndex; i < postRangeCandles.length; i++) {
      candlesSinceBreakout.push(postRangeCandles[i]);
      const found = getEntrySignal(breakout.signal, candlesSinceBreakout, settings);
      if (found) {
        entry = found;
        entryIndex = i;
        break;
      }
    }
    if (!entry || entryIndex === -1) continue;

    // Classify: recompute the same anchors getEntrySignal used, and check
    // whether the Fibonacci zone sits entirely beyond the opening range
    // (shallow) or overlaps/extends past it (deep) — matches
    // fibonacciAnchorMode already configured live (BREAKOUT_LEG).
    const anchors = getFibonacciAnchors(breakout.signal, candlesSinceBreakout, settings.fibonacciAnchorMode);
    if (anchors.low >= anchors.high) continue;
    const fibLevels = calculateFibonacciLevels(anchors.low, anchors.high, entry.direction);
    const zoneLow = entry.direction === "BULLISH" ? fibLevels.level382 : fibLevels.level236;
    const zoneHigh = entry.direction === "BULLISH" ? fibLevels.level236 : fibLevels.level382;

    const isDeep =
      entry.direction === "BULLISH"
        ? zoneLow <= openingRange.high
        : zoneHigh >= openingRange.low;

    const remainingCandles = postRangeCandles.slice(entryIndex + 1);
    if (remainingCandles.length === 0) continue;

    const positionSize = calculatePositionSize({
      accountEquity: runningEquity,
      entryPrice: entry.price,
      stopLoss: entry.stopLoss,
      settings,
    });
    if (positionSize.quantity <= 0) continue;

    const exit = simulateExit(entry.direction, entry.stopLoss, entry.takeProfit, remainingCandles, MAX_HOLD_BARS);
    const pnl =
      entry.direction === "BULLISH"
        ? (exit.price - entry.price) * positionSize.quantity
        : (entry.price - exit.price) * positionSize.quantity;
    runningEquity += pnl;

    const bucket = isDeep ? deep : shallow;
    bucket.trades += 1;
    bucket.totalPnl += pnl;
    if (pnl > 0) bucket.wins += 1;
  }

  console.log(`=== ${symbol}: FIBONACCI_ONLY split by retracement depth (holdBars=${MAX_HOLD_BARS}) ===\n`);
  for (const [label, b] of [
    ["SHALLOW (zone entirely beyond opening range)", shallow],
    ["DEEP (zone overlaps/extends into opening range)", deep],
  ] as const) {
    const wr = b.trades === 0 ? 0 : (b.wins / b.trades) * 100;
    const avg = b.trades === 0 ? 0 : b.totalPnl / b.trades;
    console.log(`${label}`);
    console.log(`  trades=${b.trades}  winRate=${wr.toFixed(1)}%  totalPnl=$${b.totalPnl.toFixed(2)}  avgPnl=$${avg.toFixed(2)}\n`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
