/**
 * Backtests the user's proposed "opening candle / trend" idea, independent
 * of ORB:
 *
 *   1. Find the first "big" 5-min candle of the session (a breakout candle
 *      — range well above the recent rolling average range).
 *   2. Watch the following ~20-30 min (4-6 candles):
 *      - If ANOTHER big candle in the SAME direction shows up in that
 *        window -> "TREND CONFIRMED" (this is the signal to send).
 *      - If price just consolidates (no confirming big candle) through the
 *        whole window -> "CHOPPY" (no signal).
 *   3. Compare forward price movement (in the breakout direction) for
 *      TREND-confirmed days vs CHOPPY days, to see whether the "second big
 *      candle" really does separate trend days from chop.
 *
 * Usage: npx tsx scripts/backtest-opening-trend.ts SPY QQQ TSLA COIN IWM
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
const MARKET_CLOSE_MIN = 16 * 60;

const ROLLING_LOOKBACK = 3; // candles used to compute the "normal" range baseline
const BIG_CANDLE_MULTIPLIER = 1.8; // candle range must exceed this x the rolling avg range
const CONFIRM_WINDOW_CANDLES = 6; // ~30 min at 5-min bars — window to look for a confirming big candle
const FORWARD_HORIZON_CANDLES = 12; // ~60 min forward — how far out we measure continuation

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

type Direction = "UP" | "DOWN";

interface DayOutcome {
  outcome: "TREND" | "CHOPPY";
  direction: Direction;
  breakoutIdx: number;
  forwardReturnPct: number; // signed in the breakout direction (positive = continued)
  continuedBig: boolean; // moved >= 0.3% further in breakout direction by horizon
}

const CONTINUATION_THRESHOLD_PCT = 0.3;

function analyzeDay(session: Candle[]): DayOutcome | null {
  if (session.length < ROLLING_LOOKBACK + CONFIRM_WINDOW_CANDLES + FORWARD_HORIZON_CANDLES) {
    return null;
  }

  let breakoutIdx = -1;
  let direction: Direction | null = null;

  for (let i = ROLLING_LOOKBACK; i < session.length - CONFIRM_WINDOW_CANDLES - FORWARD_HORIZON_CANDLES; i++) {
    const lookback = session.slice(i - ROLLING_LOOKBACK, i);
    const avgRange =
      lookback.reduce((s, c) => s + (c.high - c.low), 0) / lookback.length;
    if (avgRange <= 0) continue;

    const candle = session[i];
    const range = candle.high - candle.low;
    if (range > BIG_CANDLE_MULTIPLIER * avgRange) {
      breakoutIdx = i;
      direction = candle.close > candle.open ? "UP" : "DOWN";
      break;
    }
  }

  if (breakoutIdx === -1 || !direction) return null;

  const breakoutCandle = session[breakoutIdx];
  const lookback = session.slice(breakoutIdx - ROLLING_LOOKBACK, breakoutIdx);
  const baselineAvgRange =
    lookback.reduce((s, c) => s + (c.high - c.low), 0) / lookback.length;

  let confirmIdx = -1;
  for (
    let j = breakoutIdx + 1;
    j <= breakoutIdx + CONFIRM_WINDOW_CANDLES && j < session.length;
    j++
  ) {
    const c = session[j];
    const range = c.high - c.low;
    const candleDirection: Direction = c.close > c.open ? "UP" : "DOWN";
    if (range > BIG_CANDLE_MULTIPLIER * baselineAvgRange && candleDirection === direction) {
      confirmIdx = j;
      break;
    }
  }

  const outcome: "TREND" | "CHOPPY" = confirmIdx !== -1 ? "TREND" : "CHOPPY";

  const horizonIdx = Math.min(
    breakoutIdx + CONFIRM_WINDOW_CANDLES + FORWARD_HORIZON_CANDLES,
    session.length - 1,
  );
  const forwardPrice = session[horizonIdx].close;
  const basePrice = breakoutCandle.close;

  const rawReturnPct = ((forwardPrice - basePrice) / basePrice) * 100;
  const forwardReturnPct = direction === "UP" ? rawReturnPct : -rawReturnPct;

  return {
    outcome,
    direction,
    breakoutIdx,
    forwardReturnPct,
    continuedBig: forwardReturnPct >= CONTINUATION_THRESHOLD_PCT,
  };
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

  const trendOutcomes: DayOutcome[] = [];
  const choppyOutcomes: DayOutcome[] = [];
  let daysWithNoBreakout = 0;
  let totalDays = 0;

  for (const dayCandles of byDate.values()) {
    const session = rthCandles(dayCandles);
    totalDays++;
    const result = analyzeDay(session);
    if (!result) {
      daysWithNoBreakout++;
      continue;
    }
    if (result.outcome === "TREND") trendOutcomes.push(result);
    else choppyOutcomes.push(result);
  }

  function summarize(outcomes: DayOutcome[]): string {
    if (outcomes.length === 0) return "no instances";
    const avgReturn =
      outcomes.reduce((s, o) => s + o.forwardReturnPct, 0) / outcomes.length;
    const continuedCount = outcomes.filter((o) => o.continuedBig).length;
    const continuedPct = ((continuedCount / outcomes.length) * 100).toFixed(1);
    return `${outcomes.length} days, avg forward move (in breakout direction) ${avgReturn.toFixed(3)}%, ${continuedPct}% continued >= ${CONTINUATION_THRESHOLD_PCT}%`;
  }

  console.log(`\n=== ${symbol} — opening-candle/trend backtest, FULL YEAR ===`);
  console.log(`total trading days: ${totalDays}, no qualifying breakout candle: ${daysWithNoBreakout}`);
  console.log(`TREND (confirmed by 2nd big candle):  ${summarize(trendOutcomes)}`);
  console.log(`CHOPPY (no confirmation in window):   ${summarize(choppyOutcomes)}`);
}

async function main() {
  const symbols = process.argv.slice(2);
  if (symbols.length === 0) {
    console.error("Usage: npx tsx scripts/backtest-opening-trend.ts SYMBOL [SYMBOL...]");
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
