/**
 * Full-year version of the level-confirmation backtest, prior-day-high/low
 * leg ONLY. Twelve Data's free tier (used here, via the same chunking
 * pattern as backtest-full-year.ts) only returns regular-session bars —
 * no premarket data — so the premarket-high/low leg from
 * backtest-level-confirmation.ts cannot be tested at this sample size.
 * For premarket confirmation, see backtest-level-confirmation.ts (Yahoo
 * data, ~59-day cap, but the only source with premarket candles).
 *
 * Usage: npx tsx scripts/backtest-prior-day-level-full-year.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { buildOpeningRange, detectBreakout } from "../lib/orb-strategy";
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

const symbol = process.argv[2] ?? "SPY";
const TARGET_DAYS = 365;
const API_KEY = process.env.TWELVE_DATA_API_KEY;
const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;

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
  if (json.status === "error") {
    throw new Error(`Twelve Data error: ${json.message}`);
  }
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

    const prevDay = new Date(oldestMs - 24 * 60 * 60 * 1000);
    endDate = prevDay.toISOString().slice(0, 10);
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

function groupByEasternDate(candles: Candle[]): Map<string, Candle[]> {
  const map = new Map<string, Candle[]>();
  for (const c of candles) {
    const d = getEasternDateString(c.timestamp);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(c);
  }
  return map;
}

function rthCandles(dayCandles: Candle[]): Candle[] {
  return dayCandles.filter((c) => {
    const m = getEasternMinutesOfDay(c.timestamp);
    return m >= MARKET_OPEN_MINUTES && m < MARKET_CLOSE_MINUTES;
  });
}

interface DayResult {
  date: string;
  confirmed: boolean;
  won: boolean;
  pnlPerShare: number;
}

async function main() {
  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles (regular session only — Twelve Data free tier has no premarket)...\n`);
  const candles = await fetchFullYear();
  console.log(`\nAssembled ${candles.length} candles`);

  const byDate = groupByEasternDate(candles);
  const dates = [...byDate.keys()].sort();

  const results: DayResult[] = [];

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const priorDate = dates[i - 1];
    const priorRth = rthCandles(byDate.get(priorDate)!);
    if (priorRth.length === 0) continue;
    const priorHigh = Math.max(...priorRth.map((c) => c.high));
    const priorLow = Math.min(...priorRth.map((c) => c.low));

    const rth = rthCandles(byDate.get(date)!);
    if (rth.length === 0) continue;

    const openingRange = buildOpeningRange(symbol, date, rth);
    if (!openingRange) continue;

    const postRange = rth
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);

    let breakout = null;
    for (const c of postRange) {
      const signal = detectBreakout(openingRange, c.close, c.timestamp);
      if (signal) {
        breakout = signal;
        break;
      }
    }
    if (!breakout) continue;

    const confirmed =
      breakout.direction === "BULLISH" ? breakout.breakoutPrice > priorHigh : breakout.breakoutPrice < priorLow;

    const eod = rth[rth.length - 1];
    const pnlPerShare =
      breakout.direction === "BULLISH" ? eod.close - breakout.breakoutPrice : breakout.breakoutPrice - eod.close;

    results.push({ date, confirmed, won: pnlPerShare > 0, pnlPerShare });
  }

  function summarize(rows: DayResult[]): string {
    if (rows.length === 0) return "no trades";
    const wins = rows.filter((r) => r.won).length;
    const totalPnl = rows.reduce((s, r) => s + r.pnlPerShare, 0);
    const wr = ((wins / rows.length) * 100).toFixed(1);
    const avg = (totalPnl / rows.length).toFixed(3);
    return `${rows.length} trades  ${wr}% WR  $${totalPnl.toFixed(2)} total  $${avg} avg/share`;
  }

  const confirmedRows = results.filter((r) => r.confirmed);
  const unconfirmedRows = results.filter((r) => !r.confirmed);

  console.log(`\n=== ${symbol} — prior-day-level confirmation, FULL YEAR (${results.length} breakout days, EOD exit) ===`);
  console.log(`confirmed (broke prior-day RTH high/low too): ${summarize(confirmedRows)}`);
  console.log(`unconfirmed (OR level only):                  ${summarize(unconfirmedRows)}`);
}

main();
