/**
 * Backtests whether an opening-session head-and-shoulders pattern on SPY
 * 5-min candles has any predictive value — i.e., does a confirmed neckline
 * break actually lead to further downside, more than a random point in the
 * session would?
 *
 * Pattern detection (causal — only uses data available at each point):
 *   1. Find pivot highs/lows: a candle's high (low) is a pivot if it's the
 *      highest (lowest) among PIVOT_LOOKBACK candles on each side.
 *   2. Look for 3 consecutive pivot highs — left shoulder, head (higher than
 *      both shoulders), right shoulder (within SHOULDER_TOLERANCE_PCT of the
 *      left shoulder) — with 2 pivot lows between them forming the neckline
 *      (averaged).
 *   3. Confirmation: the first candle after the right shoulder whose CLOSE
 *      is below the neckline.
 *   4. Forward return: price change from the confirmation candle's close to
 *      FORWARD_HORIZON_CANDLES later (signed so negative-further-down reads
 *      as "continued").
 *
 * Baseline: same forward-return measurement taken from a random point in
 * each session (matched count), to see if H&S confirmation actually beats
 * "any point in the session tends to drift" as an explanation.
 *
 * Usage: npx tsx scripts/backtest-head-and-shoulders.ts SPY [SYMBOL...]
 */
import { readFileSync } from "fs";
import { join } from "path";
import { getEasternDateString, getEasternMinutesOfDay } from "../lib/market-hours";
import type { Candle } from "../types/trading";

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

const API_KEY = process.env.TWELVE_DATA_API_KEY;
const TARGET_DAYS = 365;
const MARKET_OPEN_MIN = 9 * 60 + 30;
const SESSION_END_MIN = 11 * 60; // restrict pattern search to the opening session (9:30-11:00)
const MARKET_CLOSE_MIN = 16 * 60;

const PIVOT_LOOKBACK = 2;
const SHOULDER_TOLERANCE_PCT = 0.4; // right shoulder within 0.4% of left shoulder's height
const FORWARD_HORIZON_CANDLES = 12; // ~60 min forward

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

async function fetchChunk(symbol: string, endDate: string | null): Promise<RawValue[]> {
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

async function fetchFullYear(symbol: string): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const cutoff = Date.now() - TARGET_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    const chunk = await fetchChunk(symbol, endDate);
    if (chunk.length === 0) break;
    allValues.push(...chunk);
    const oldestMs = Date.parse(`${chunk[chunk.length - 1].datetime.replace(" ", "T")}Z`);
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

function sessionCandles(dayCandles: Candle[]): Candle[] {
  return dayCandles
    .filter((c) => {
      const m = getEasternMinutesOfDay(c.timestamp);
      return m >= MARKET_OPEN_MIN && m < MARKET_CLOSE_MIN;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

interface Pivot {
  idx: number;
  price: number;
}

function findPivotHighs(session: Candle[], upTo: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = PIVOT_LOOKBACK; i < upTo - PIVOT_LOOKBACK; i++) {
    const window = session.slice(i - PIVOT_LOOKBACK, i + PIVOT_LOOKBACK + 1);
    const isPivot = window.every((c, j) => j === PIVOT_LOOKBACK || c.high <= session[i].high);
    if (isPivot) pivots.push({ idx: i, price: session[i].high });
  }
  return pivots;
}

function findPivotLows(session: Candle[], upTo: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = PIVOT_LOOKBACK; i < upTo - PIVOT_LOOKBACK; i++) {
    const window = session.slice(i - PIVOT_LOOKBACK, i + PIVOT_LOOKBACK + 1);
    const isPivot = window.every((c, j) => j === PIVOT_LOOKBACK || c.low >= session[i].low);
    if (isPivot) pivots.push({ idx: i, price: session[i].low });
  }
  return pivots;
}

interface PatternResult {
  confirmIdx: number;
  forwardReturnPct: number; // positive = continued down (bearish pattern confirmed)
}

function detectHeadAndShoulders(session: Candle[]): PatternResult | null {
  const sessionEndIdx = session.findIndex((c) => getEasternMinutesOfDay(c.timestamp) >= SESSION_END_MIN);
  const scanLimit = sessionEndIdx === -1 ? session.length : sessionEndIdx;
  if (scanLimit < 10) return null;

  const highs = findPivotHighs(session, scanLimit);
  const lows = findPivotLows(session, scanLimit);
  if (highs.length < 3 || lows.length < 2) return null;

  for (let i = 0; i + 2 < highs.length; i++) {
    const leftShoulder = highs[i];
    const head = highs[i + 1];
    const rightShoulder = highs[i + 2];

    if (head.price <= leftShoulder.price || head.price <= rightShoulder.price) continue;

    const shoulderDiffPct = (Math.abs(rightShoulder.price - leftShoulder.price) / leftShoulder.price) * 100;
    if (shoulderDiffPct > SHOULDER_TOLERANCE_PCT) continue;

    const necklineLows = lows.filter((l) => l.idx > leftShoulder.idx && l.idx < rightShoulder.idx);
    if (necklineLows.length < 1) continue;
    const neckline = necklineLows.reduce((s, l) => s + l.price, 0) / necklineLows.length;

    for (let j = rightShoulder.idx + 1; j < scanLimit + FORWARD_HORIZON_CANDLES && j < session.length; j++) {
      if (session[j].close < neckline) {
        const horizonIdx = Math.min(j + FORWARD_HORIZON_CANDLES, session.length - 1);
        const basePrice = session[j].close;
        const forwardPrice = session[horizonIdx].close;
        const forwardReturnPct = ((basePrice - forwardPrice) / basePrice) * 100; // positive = further decline
        return { confirmIdx: j, forwardReturnPct };
      }
    }
  }
  return null;
}

function baselineReturn(session: Candle[], atIdx: number): number | null {
  const horizonIdx = atIdx + FORWARD_HORIZON_CANDLES;
  if (horizonIdx >= session.length) return null;
  const basePrice = session[atIdx].close;
  const forwardPrice = session[horizonIdx].close;
  return ((basePrice - forwardPrice) / basePrice) * 100;
}

async function backtestSymbol(symbol: string): Promise<void> {
  console.log(`\nAssembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...`);
  const candles = await fetchFullYear(symbol);
  console.log(`  assembled ${candles.length} candles`);

  const byDate = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = getEasternDateString(c.timestamp);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(c);
  }

  const patternReturns: number[] = [];
  const baselineReturns: number[] = [];
  let totalDays = 0;
  let patternDays = 0;

  for (const dayCandles of byDate.values()) {
    const session = sessionCandles(dayCandles);
    totalDays++;
    if (session.length < 20) continue;

    const result = detectHeadAndShoulders(session);
    if (!result) continue;

    patternDays++;
    patternReturns.push(result.forwardReturnPct);

    const baseline = baselineReturn(session, result.confirmIdx - 1 >= 0 ? result.confirmIdx - 1 : result.confirmIdx);
    if (baseline !== null) baselineReturns.push(baseline);
  }

  function summarize(returns: number[]): string {
    if (returns.length === 0) return "no instances";
    const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
    const continuedCount = returns.filter((r) => r >= 0.15).length;
    const continuedPct = ((continuedCount / returns.length) * 100).toFixed(1);
    return `${returns.length} instances, avg forward move ${avg.toFixed(3)}% (positive = further decline), ${continuedPct}% declined >= 0.15%`;
  }

  console.log(`\n=== ${symbol} — opening-session head-and-shoulders backtest, FULL YEAR ===`);
  console.log(`total trading days: ${totalDays}, pattern confirmed: ${patternDays}`);
  console.log(`H&S neckline-break outcome: ${summarize(patternReturns)}`);
  console.log(`baseline (same point, no pattern requirement): ${summarize(baselineReturns)}`);
}

async function main() {
  const symbols = process.argv.slice(2);
  if (symbols.length === 0) {
    console.error("Usage: npx tsx scripts/backtest-head-and-shoulders.ts SYMBOL [SYMBOL...]");
    process.exit(1);
  }
  for (const symbol of symbols) {
    try {
      await backtestSymbol(symbol);
    } catch (err) {
      console.error(`${symbol}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
