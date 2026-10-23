/**
 * Full-year version of backtest-level-confirmation.ts. Yahoo's intraday
 * chart endpoint caps a single request's range at ~60 calendar days, so
 * this chunks ~55-day windows backward via explicit period1/period2 (not
 * the "range" shorthand the shared client uses) to assemble ~365 days,
 * then reuses the same confirmed-vs-unconfirmed classification.
 *
 * Usage: npx tsx scripts/backtest-level-confirmation-full-year.ts SPY QQQ TSLA COIN CRWD
 */
import { parseYahooCandles, type YahooChartResponse } from "../lib/market-data-client";
import { buildOpeningRange, detectBreakout } from "../lib/orb-strategy";
import { getEasternDateString, getEasternMinutesOfDay } from "../lib/market-hours";
import type { Candle } from "../types/trading";

const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;
const TARGET_DAYS = 365;
const CHUNK_DAYS = 55; // stay under Yahoo's ~60-day intraday cap per request
const CHUNK_DELAY_MS = 500; // be polite to the unofficial endpoint

interface DayResult {
  date: string;
  direction: "BULLISH" | "BEARISH";
  confirmed: boolean;
  won: boolean;
  pnlPerShare: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChunk(symbol: string, period1: number, period2: number): Promise<Candle[]> {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("interval", "5m");
  url.searchParams.set("period1", String(period1));
  url.searchParams.set("period2", String(period2));
  url.searchParams.set("includePrePost", "true");

  const response = await fetch(url.toString(), { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) {
    throw new Error(`Yahoo Finance request failed: ${response.status} ${response.statusText}`);
  }
  const json = (await response.json()) as YahooChartResponse;
  return parseYahooCandles(json);
}

async function fetchFullYear(symbol: string): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const yearAgo = now - TARGET_DAYS * 86400;
  const all: Candle[] = [];
  const seen = new Set<number>();

  let windowEnd = now;
  while (windowEnd > yearAgo) {
    const windowStart = Math.max(yearAgo, windowEnd - CHUNK_DAYS * 86400);
    console.log(`  fetching ${symbol} ${new Date(windowStart * 1000).toISOString().slice(0, 10)} -> ${new Date(windowEnd * 1000).toISOString().slice(0, 10)}...`);
    try {
      const chunk = await fetchChunk(symbol, windowStart, windowEnd);
      for (const c of chunk) {
        if (!seen.has(c.timestamp)) {
          seen.add(c.timestamp);
          all.push(c);
        }
      }
    } catch (err) {
      console.error(`  chunk failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    windowEnd = windowStart;
    await sleep(CHUNK_DELAY_MS);
  }

  return all.sort((a, b) => a.timestamp - b.timestamp);
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

function premarketCandles(dayCandles: Candle[]): Candle[] {
  return dayCandles.filter((c) => getEasternMinutesOfDay(c.timestamp) < MARKET_OPEN_MINUTES);
}

async function backtestSymbol(symbol: string): Promise<void> {
  console.log(`\nAssembling ~365 days of ${symbol} 5-min candles (with premarket)...`);
  const candles = await fetchFullYear(symbol);
  console.log(`  assembled ${candles.length} candles`);

  const byDate = groupByEasternDate(candles);
  const dates = [...byDate.keys()].sort();

  const results: DayResult[] = [];

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const priorDate = dates[i - 1];
    const dayCandles = byDate.get(date)!;
    const priorDayCandles = byDate.get(priorDate)!;

    const priorRth = rthCandles(priorDayCandles);
    if (priorRth.length === 0) continue;
    const priorHigh = Math.max(...priorRth.map((c) => c.high));
    const priorLow = Math.min(...priorRth.map((c) => c.low));

    const pre = premarketCandles(dayCandles);
    const premarketHigh = pre.length > 0 ? Math.max(...pre.map((c) => c.high)) : null;
    const premarketLow = pre.length > 0 ? Math.min(...pre.map((c) => c.low)) : null;

    const rth = rthCandles(dayCandles);
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
      breakout.direction === "BULLISH"
        ? breakout.breakoutPrice > priorHigh || (premarketHigh !== null && breakout.breakoutPrice > premarketHigh)
        : breakout.breakoutPrice < priorLow || (premarketLow !== null && breakout.breakoutPrice < premarketLow);

    const eod = rth[rth.length - 1];
    const pnlPerShare =
      breakout.direction === "BULLISH"
        ? eod.close - breakout.breakoutPrice
        : breakout.breakoutPrice - eod.close;

    results.push({
      date,
      direction: breakout.direction,
      confirmed,
      won: pnlPerShare > 0,
      pnlPerShare,
    });
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

  console.log(`\n=== ${symbol} — level-confirmation backtest, FULL YEAR (${results.length} breakout days, EOD exit) ===`);
  console.log(`confirmed (broke prior-day or premarket level too): ${summarize(confirmedRows)}`);
  console.log(`unconfirmed (OR level only):                        ${summarize(unconfirmedRows)}`);
}

async function main() {
  const symbols = process.argv.slice(2);
  if (symbols.length === 0) {
    console.error("Usage: npx tsx scripts/backtest-level-confirmation-full-year.ts SYMBOL [SYMBOL...]");
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
