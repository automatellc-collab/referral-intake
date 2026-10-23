/**
 * Tests the claim: "if candles consolidate tightly around VWAP for ~4
 * candles, a breakout is due." Uses a full year of 5-min regular-session
 * candles (Twelve Data, same chunking pattern as backtest-full-year.ts).
 *
 * Definitions:
 *   - VWAP: running cumulative VWAP from session open (calculateVWAP).
 *   - "Consolidation": exactly CONSOLIDATION_LEN consecutive candles (after
 *     the first 15 min, so VWAP has some real weight behind it) each within
 *     CONSOLIDATION_BAND_PCT of VWAP.
 *   - "Breakout" after consolidation: within LOOKAHEAD_CANDLES candles after
 *     the consolidation window ends, price closes beyond the consolidation
 *     window's own high/low by at least BREAKOUT_THRESHOLD_PCT.
 *   - Baseline: same breakout definition applied to every OTHER 4-candle
 *     window in the session (not preceded by/part of a flagged
 *     consolidation), to see if consolidation actually raises the odds
 *     above the base rate — not just "breakouts happen sometimes."
 *
 * Usage: npx tsx scripts/backtest-vwap-consolidation-breakout.ts SPY QQQ TSLA AMD COIN
 */
import { readFileSync } from "fs";
import { join } from "path";
import { calculateVWAP } from "../lib/multi-strategy-signals";
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
const MARKET_CLOSE_MIN = 16 * 60;
const WARMUP_MIN = 9 * 60 + 45; // let VWAP accumulate past the opening range before testing

const CONSOLIDATION_LEN = 4;
const CONSOLIDATION_BAND_PCT = 0.15; // tight: within 0.15% of VWAP for all 4 candles
const LOOKAHEAD_CANDLES = 6; // 30 min
const BREAKOUT_THRESHOLD_PCT = 0.15; // clears the consolidation range by this much

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

function rthCandles(dayCandles: Candle[]): Candle[] {
  return dayCandles
    .filter((c) => {
      const m = getEasternMinutesOfDay(c.timestamp);
      return m >= MARKET_OPEN_MIN && m < MARKET_CLOSE_MIN;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

interface Outcome {
  breakoutOccurred: boolean;
  direction: "UP" | "DOWN" | null;
  candlesToBreakout: number | null;
}

function testWindow(
  session: Candle[],
  windowStartIdx: number,
  windowLen: number,
): Outcome {
  const window = session.slice(windowStartIdx, windowStartIdx + windowLen);
  const rangeHigh = Math.max(...window.map((c) => c.high));
  const rangeLow = Math.min(...window.map((c) => c.low));

  const afterStart = windowStartIdx + windowLen;
  const lookahead = session.slice(afterStart, afterStart + LOOKAHEAD_CANDLES);

  for (let i = 0; i < lookahead.length; i++) {
    const c = lookahead[i];
    const upBreakout = c.close > rangeHigh * (1 + BREAKOUT_THRESHOLD_PCT / 100);
    const downBreakout = c.close < rangeLow * (1 - BREAKOUT_THRESHOLD_PCT / 100);
    if (upBreakout) return { breakoutOccurred: true, direction: "UP", candlesToBreakout: i + 1 };
    if (downBreakout) return { breakoutOccurred: true, direction: "DOWN", candlesToBreakout: i + 1 };
  }
  return { breakoutOccurred: false, direction: null, candlesToBreakout: null };
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

  const consolidationOutcomes: Outcome[] = [];
  const baselineOutcomes: Outcome[] = [];

  for (const dayCandles of byDate.values()) {
    const session = rthCandles(dayCandles);
    if (session.length < CONSOLIDATION_LEN + LOOKAHEAD_CANDLES + 4) continue;

    // VWAP is cumulative from session open — precompute the running VWAP at
    // each index using calculateVWAP over candles[0..i] inclusive.
    const vwapAt: (number | null)[] = session.map((_, i) => calculateVWAP(session.slice(0, i + 1)));

    const consolidationStartIndices = new Set<number>();

    for (let i = 0; i + CONSOLIDATION_LEN <= session.length; i++) {
      const firstCandle = session[i];
      if (getEasternMinutesOfDay(firstCandle.timestamp) < WARMUP_MIN) continue;
      if (i + CONSOLIDATION_LEN + LOOKAHEAD_CANDLES > session.length) continue;

      let isConsolidating = true;
      for (let j = i; j < i + CONSOLIDATION_LEN; j++) {
        const vwap = vwapAt[j];
        if (vwap === null || vwap === 0) {
          isConsolidating = false;
          break;
        }
        const deviationPct = Math.abs((session[j].close - vwap) / vwap) * 100;
        if (deviationPct > CONSOLIDATION_BAND_PCT) {
          isConsolidating = false;
          break;
        }
      }

      if (isConsolidating) {
        consolidationOutcomes.push(testWindow(session, i, CONSOLIDATION_LEN));
        consolidationStartIndices.add(i);
      }
    }

    // Baseline: every other valid 4-candle window in the session (after
    // warmup, with enough lookahead room), skipping ones already counted
    // as a flagged consolidation.
    for (let i = 0; i + CONSOLIDATION_LEN + LOOKAHEAD_CANDLES <= session.length; i++) {
      if (getEasternMinutesOfDay(session[i].timestamp) < WARMUP_MIN) continue;
      if (consolidationStartIndices.has(i)) continue;
      baselineOutcomes.push(testWindow(session, i, CONSOLIDATION_LEN));
    }
  }

  function summarize(outcomes: Outcome[]): string {
    if (outcomes.length === 0) return "no windows";
    const breakouts = outcomes.filter((o) => o.breakoutOccurred);
    const rate = ((breakouts.length / outcomes.length) * 100).toFixed(1);
    const up = breakouts.filter((o) => o.direction === "UP").length;
    const down = breakouts.filter((o) => o.direction === "DOWN").length;
    const avgCandles =
      breakouts.length > 0
        ? (breakouts.reduce((s, o) => s + (o.candlesToBreakout ?? 0), 0) / breakouts.length).toFixed(1)
        : "n/a";
    return `${outcomes.length} windows, ${rate}% saw a breakout within ${LOOKAHEAD_CANDLES} candles (${up} up / ${down} down), avg ${avgCandles} candles to breakout`;
  }

  console.log(`\n=== ${symbol} — VWAP consolidation -> breakout, FULL YEAR ===`);
  console.log(`consolidation (${CONSOLIDATION_LEN} candles within ${CONSOLIDATION_BAND_PCT}% of VWAP): ${summarize(consolidationOutcomes)}`);
  console.log(`baseline (any other 4-candle window):                          ${summarize(baselineOutcomes)}`);
}

async function main() {
  const symbols = process.argv.slice(2);
  if (symbols.length === 0) {
    console.error("Usage: npx tsx scripts/backtest-vwap-consolidation-breakout.ts SYMBOL [SYMBOL...]");
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
