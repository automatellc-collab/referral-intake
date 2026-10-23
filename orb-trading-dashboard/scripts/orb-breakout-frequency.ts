/**
 * Answers two questions per symbol, over a full year of 5-min candles:
 *   1. How many candles after the opening range does the first ORB
 *      high/low breakout typically take?
 *   2. Of days that get a breakout, what fraction actually produce a
 *      real FIBONACCI_ONLY entry signal (our live criteria) — and how
 *      many candles after the breakout does that take?
 *
 * Usage: npx tsx scripts/orb-breakout-frequency.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { buildOpeningRange, detectBreakout, getEntrySignal } from "../lib/orb-strategy";
import { getEasternDateString } from "../lib/market-hours";
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
  const groups = new Map<string, Candle[]>();
  for (const c of candles) {
    const date = getEasternDateString(c.timestamp);
    const existing = groups.get(date) ?? [];
    existing.push(c);
    groups.set(date, existing);
  }
  return groups;
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settings: TradingSettings = { ...(await settingsRes.json()).data, entryTypeFilter: "FIBONACCI_ONLY" };

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...\n`);
  const candles = await fetchFullYear();
  console.log(`\nAssembled ${candles.length} candles\n`);

  const dayGroups = groupByEasternDate(candles);

  let totalDays = 0;
  let daysWithValidRange = 0;
  let daysWithBreakout = 0;
  let daysWithEntry = 0;
  const candlesToBreakout: number[] = [];
  const candlesBreakoutToEntry: number[] = [];

  for (const [date, dayCandles] of dayGroups) {
    totalDays++;
    const openingRange = buildOpeningRange(symbol, date, dayCandles);
    if (!openingRange) continue;
    daysWithValidRange++;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    let breakoutIndex = -1;
    for (let i = 0; i < postRangeCandles.length; i++) {
      const signal = detectBreakout(openingRange, postRangeCandles[i].close, postRangeCandles[i].timestamp);
      if (signal) {
        breakoutIndex = i;
        break;
      }
    }
    if (breakoutIndex === -1) continue;
    daysWithBreakout++;
    candlesToBreakout.push(breakoutIndex + 1);

    const breakoutSignal = detectBreakout(
      openingRange,
      postRangeCandles[breakoutIndex].close,
      postRangeCandles[breakoutIndex].timestamp,
    )!;

    const candlesSinceBreakout: Candle[] = [];
    let entryIndex = -1;
    for (let i = breakoutIndex; i < postRangeCandles.length; i++) {
      candlesSinceBreakout.push(postRangeCandles[i]);
      const entry = getEntrySignal(breakoutSignal, candlesSinceBreakout, settings);
      if (entry) {
        entryIndex = i;
        break;
      }
    }
    if (entryIndex === -1) continue;
    daysWithEntry++;
    candlesBreakoutToEntry.push(entryIndex - breakoutIndex + 1);
  }

  console.log(`=== ${symbol} — ORB breakout & FIBONACCI entry frequency, ~${TARGET_DAYS}-day sample ===\n`);
  console.log(`Total trading days scanned:          ${totalDays}`);
  console.log(`Days with a valid opening range:     ${daysWithValidRange} (${(100 * daysWithValidRange / totalDays).toFixed(1)}%)`);
  console.log(`Days with ANY OR breakout:            ${daysWithBreakout} (${(100 * daysWithBreakout / daysWithValidRange).toFixed(1)}% of valid-range days)`);
  console.log(`Days with a FIBONACCI entry signal:   ${daysWithEntry} (${(100 * daysWithEntry / daysWithValidRange).toFixed(1)}% of valid-range days, ${(100 * daysWithEntry / daysWithBreakout).toFixed(1)}% of breakout days)`);
  console.log();
  console.log(`Candles from OR close to breakout:    mean ${mean(candlesToBreakout).toFixed(1)}, median ${median(candlesToBreakout)} (5-min candles)`);
  console.log(`Candles from breakout to FIB entry:    mean ${mean(candlesBreakoutToEntry).toFixed(1)}, median ${median(candlesBreakoutToEntry)} (5-min candles)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
