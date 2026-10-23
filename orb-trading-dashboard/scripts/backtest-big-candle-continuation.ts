/**
 * Exploratory (2026-09-23): today produced several outsized moves after the
 * initial ORB breakout (QQQ/SPY/NVDA all had candles with 2-4x the normal
 * 5-min range mid-move). This tests whether an unusually large-range candle,
 * closing in the breakout direction, has predictive value for continuation
 * on the next bar(s) — a "big candle" momentum/exhaustion pattern, distinct
 * from CONTINUATION (pullback-then-break) and FIBONACCI (retracement).
 *
 * Definition: among post-breakout candles, a candle is "big" if its range
 * (high-low) is >= BIG_CANDLE_MULTIPLIER times the median range of the
 * opening-range candles (the day's baseline volatility), AND it closes in
 * the breakout direction. Entry is that candle's close; stop/target use the
 * same ORB stop-loss (opening range low/high) and 3R target as every other
 * entry type, for apples-to-apples comparison.
 *
 * Usage: npx tsx scripts/backtest-big-candle-continuation.ts [SYMBOL]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { buildOpeningRange, detectBreakout } from "../lib/orb-strategy";
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
const HOLD_BAR_OPTIONS = [undefined, 1, 2, 3, 4, 6, 8, 10, 15, 20];
const BIG_CANDLE_MULTIPLIER = 2.5;

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

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...\n`);
  const candles = await fetchFullYear();
  console.log(`\nAssembled ${candles.length} candles\n`);

  const dayGroups = groupByEasternDate(candles);

  // One bucket per hold-bar option, populated by walking each day once.
  const buckets = new Map<string, Bucket>();
  for (const bars of HOLD_BAR_OPTIONS) buckets.set(String(bars ?? "EOD"), emptyBucket());

  let bigCandleCount = 0;
  let dayCount = 0;

  for (const [date, dayCandles] of dayGroups) {
    const openingRange = buildOpeningRange(symbol, date, dayCandles);
    if (!openingRange) continue;
    dayCount++;

    const openingRangeCandles = dayCandles.filter((c) => c.timestamp <= openingRange.formedAt);
    const baselineRange = median(openingRangeCandles.map((c) => c.high - c.low)) || openingRange.high - openingRange.low;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    const breakout = findFirstBreakout(postRangeCandles, openingRange);
    if (!breakout) continue;

    const postBreakoutCandles = postRangeCandles.filter((c) => c.timestamp > breakout.signal.breakoutAt);

    // Find the FIRST big candle after breakout (sticky — same rationale as
    // the Fibonacci scan: don't just check the newest candle each poll).
    let bigIndex = -1;
    for (let i = 0; i < postBreakoutCandles.length; i++) {
      const c = postBreakoutCandles[i];
      const range = c.high - c.low;
      const isBig = range >= baselineRange * BIG_CANDLE_MULTIPLIER;
      const closesWithTrend =
        breakout.signal.direction === "BULLISH" ? c.close > c.open : c.close < c.open;
      if (isBig && closesWithTrend) {
        bigIndex = i;
        break;
      }
    }
    if (bigIndex === -1) continue;
    bigCandleCount++;

    const entryCandle = postBreakoutCandles[bigIndex];
    const entryPrice = entryCandle.close;
    const direction = breakout.signal.direction;
    const stopLoss = direction === "BULLISH" ? openingRange.low : openingRange.high;
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    if (riskPerShare === 0) continue;
    const takeProfit =
      direction === "BULLISH"
        ? entryPrice + riskPerShare * baseSettings.riskRewardRatio
        : entryPrice - riskPerShare * baseSettings.riskRewardRatio;

    const remainingCandles = postBreakoutCandles.slice(bigIndex + 1);
    if (remainingCandles.length === 0) continue;

    const positionSize = calculatePositionSize({
      accountEquity: 10000,
      entryPrice,
      stopLoss,
      settings: baseSettings,
    });
    if (positionSize.quantity <= 0) continue;

    for (const bars of HOLD_BAR_OPTIONS) {
      const exit = simulateExit(direction, stopLoss, takeProfit, remainingCandles, bars);
      const pnl =
        direction === "BULLISH"
          ? (exit.price - entryPrice) * positionSize.quantity
          : (entryPrice - exit.price) * positionSize.quantity;
      const bucket = buckets.get(String(bars ?? "EOD"))!;
      bucket.trades += 1;
      bucket.totalPnl += pnl;
      if (pnl > 0) bucket.wins += 1;
    }
  }

  console.log(`=== ${symbol}: BIG_CANDLE_CONTINUATION (>=${BIG_CANDLE_MULTIPLIER}x opening-range median range) ===`);
  console.log(`${bigCandleCount} big-candle events across ${dayCount} trading days\n`);
  console.log("holdBars".padEnd(10), "trades".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(11), "avgPnl");

  let best = { bars: "EOD", winRate: -1, totalPnl: -Infinity, trades: 0 };
  for (const bars of HOLD_BAR_OPTIONS) {
    const b = buckets.get(String(bars ?? "EOD"))!;
    const wr = b.trades === 0 ? 0 : (b.wins / b.trades) * 100;
    const avg = b.trades === 0 ? 0 : b.totalPnl / b.trades;
    console.log(
      String(bars ?? "EOD").padEnd(10),
      String(b.trades).padEnd(8),
      (wr.toFixed(1) + "%").padEnd(9),
      ("$" + b.totalPnl.toFixed(2)).padEnd(11),
      "$" + avg.toFixed(2),
    );
    if (b.trades >= 10 && b.totalPnl > best.totalPnl) {
      best = { bars: String(bars ?? "EOD"), winRate: wr, totalPnl: b.totalPnl, trades: b.trades };
    }
  }
  console.log(`\nBest: holdBars=${best.bars} -> ${best.winRate.toFixed(1)}% WR, $${best.totalPnl.toFixed(2)} total P&L over ${best.trades} trades`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
