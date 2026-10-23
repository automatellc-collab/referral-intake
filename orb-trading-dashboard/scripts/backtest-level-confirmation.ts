/**
 * Quick backtest: does an ORB breakout do better when it's "confirmed" by
 * also clearing the prior day's regular-session high/low and/or today's
 * premarket high/low, versus a breakout that's just the opening-range level
 * alone with no other level backing it up?
 *
 * Data source: Yahoo Finance client (lib/market-data-client.ts) — the only
 * one of our two data sources that returns premarket candles
 * (includePrePost=true). This caps the lookback at Yahoo's ~59-calendar-day
 * intraday limit, so this is a ~2-month sample, not a full year.
 *
 * Classification per trading day (first ORB breakout only, EOD exit):
 *   - premarket high/low: extrema of candles between midnight ET and 9:30 ET
 *   - prior-day high/low: extrema of the PRIOR trading day's 9:30-16:00 ET candles
 *   - "confirmed" if a BULLISH breakout's breakout price is above the
 *     prior-day high OR today's premarket high (BEARISH: below prior-day low
 *     OR premarket low)
 *   - "unconfirmed" otherwise
 *
 * Usage: npx tsx scripts/backtest-level-confirmation.ts SPY QQQ TSLA COIN CRWD
 */
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { buildOpeningRange, detectBreakout } from "../lib/orb-strategy";
import { getEasternDateString, getEasternMinutesOfDay } from "../lib/market-hours";
import type { Candle } from "../types/trading";

const MARKET_OPEN_MINUTES = 9 * 60 + 30;
const MARKET_CLOSE_MINUTES = 16 * 60;

interface DayResult {
  date: string;
  direction: "BULLISH" | "BEARISH";
  confirmed: boolean;
  won: boolean;
  pnlPerShare: number;
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
  const client = createMarketDataClientFromEnv();
  // 59 days * ~78 5-min RTH candles/day, generously overshot to also pull
  // premarket bars (~78 more/day) — outputsize is a hint, not a hard cap
  // for this client (it slices after fetching a whole calendar range).
  const candles = await client.getHistoricals(symbol, "5min", 59 * 160);

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

  console.log(`\n=== ${symbol} — level-confirmation backtest (${results.length} breakout days, EOD exit) ===`);
  console.log(`confirmed (broke prior-day or premarket level too): ${summarize(confirmedRows)}`);
  console.log(`unconfirmed (OR level only):                        ${summarize(unconfirmedRows)}`);
}

async function main() {
  const symbols = process.argv.slice(2);
  if (symbols.length === 0) {
    console.error("Usage: npx tsx scripts/backtest-level-confirmation.ts SYMBOL [SYMBOL...]");
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
