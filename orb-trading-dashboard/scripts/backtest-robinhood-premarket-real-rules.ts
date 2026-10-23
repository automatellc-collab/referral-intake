/**
 * Runs the REAL backtest engine (FIBONACCI entry filter, stop-loss,
 * take-profit, quality-breakout gate — everything the live signal engine
 * uses) over the full year of real Robinhood premarket data already
 * fetched into data/backtests/robinhood-chunks/, then buckets each trade's
 * result by which external level (premarket high/low, prior-day RTH
 * high/low, both, or neither) its breakout day satisfied — answering
 * whether prior-day-level confirmation adds anything on top of premarket,
 * under the actual trading rules rather than a naive EOD-exit proxy.
 *
 * Usage: npx tsx scripts/backtest-robinhood-premarket-real-rules.ts
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { runBacktest } from "../lib/backtest-engine";
import { buildOpeningRange } from "../lib/orb-strategy";
import { getEasternDateString } from "../lib/market-hours";
import type { Candle, TradingSettings } from "../types/trading";

const CHUNK_DIR = join(__dirname, "..", "data", "backtests", "robinhood-chunks");
const SYMBOLS = ["SPY", "QQQ", "TSLA", "COIN", "CRWD"];
const MARKET_OPEN_MIN = 9 * 60 + 30;
const OR_CLOSE_MIN = 9 * 60 + 45;

interface RhBar {
  begins_at: string;
  open_price: string;
  high_price: string;
  low_price: string;
  close_price: string;
  volume: number;
  session: "pre" | "reg" | "post";
}

interface RhResult {
  symbol: string;
  bars: RhBar[];
}

function loadAllBars(): Map<string, RhBar[]> {
  const bySymbol = new Map<string, RhBar[]>();
  const seen = new Map<string, Set<string>>();

  for (const file of readdirSync(CHUNK_DIR)) {
    const json = JSON.parse(readFileSync(join(CHUNK_DIR, file), "utf-8"));
    for (const result of json.data.results as RhResult[]) {
      if (!bySymbol.has(result.symbol)) {
        bySymbol.set(result.symbol, []);
        seen.set(result.symbol, new Set());
      }
      const seenSet = seen.get(result.symbol)!;
      for (const bar of result.bars) {
        if (seenSet.has(bar.begins_at)) continue;
        seenSet.add(bar.begins_at);
        bySymbol.get(result.symbol)!.push(bar);
      }
    }
  }

  for (const bars of bySymbol.values()) {
    bars.sort((a, b) => Date.parse(a.begins_at) - Date.parse(b.begins_at));
  }
  return bySymbol;
}

function toCandle(bar: RhBar): Candle {
  return {
    timestamp: Date.parse(bar.begins_at),
    open: parseFloat(bar.open_price),
    high: parseFloat(bar.high_price),
    low: parseFloat(bar.low_price),
    close: parseFloat(bar.close_price),
    volume: bar.volume,
  };
}

function easternMinutes(timestampMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestampMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return (hour % 24) * 60 + minute;
}

type Confirmation = "both" | "priorday_only" | "premarket_only" | "neither";

function classifyDays(bars: RhBar[]): Map<string, Confirmation> {
  const byDate = new Map<string, RhBar[]>();
  for (const b of bars) {
    const date = getEasternDateString(Date.parse(b.begins_at));
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(b);
  }
  const dates = [...byDate.keys()].sort();
  const classification = new Map<string, Confirmation>();

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const priorDate = dates[i - 1];
    const dayBars = byDate.get(date)!;
    const priorBars = byDate.get(priorDate)!;

    const priorReg = priorBars.filter((b) => b.session === "reg");
    if (priorReg.length === 0) continue;
    const priorHigh = Math.max(...priorReg.map((b) => parseFloat(b.high_price)));
    const priorLow = Math.min(...priorReg.map((b) => parseFloat(b.low_price)));

    const pre = dayBars.filter((b) => b.session === "pre");
    const premarketHigh = pre.length > 0 ? Math.max(...pre.map((b) => parseFloat(b.high_price))) : null;
    const premarketLow = pre.length > 0 ? Math.min(...pre.map((b) => parseFloat(b.low_price))) : null;

    const reg = dayBars
      .filter((b) => b.session === "reg")
      .sort((a, b) => Date.parse(a.begins_at) - Date.parse(b.begins_at));
    if (reg.length === 0) continue;

    const orBars = reg.filter((b) => {
      const m = easternMinutes(Date.parse(b.begins_at));
      return m >= MARKET_OPEN_MIN && m < OR_CLOSE_MIN;
    });
    if (orBars.length === 0) continue;
    const orHigh = Math.max(...orBars.map((b) => parseFloat(b.high_price)));
    const orLow = Math.min(...orBars.map((b) => parseFloat(b.low_price)));
    if (orHigh <= orLow) continue;

    const postRange = reg.filter((b) => easternMinutes(Date.parse(b.begins_at)) >= OR_CLOSE_MIN);

    let direction: "BULLISH" | "BEARISH" | null = null;
    let breakoutPrice: number | null = null;
    for (const b of postRange) {
      const close = parseFloat(b.close_price);
      if (close > orHigh) {
        direction = "BULLISH";
        breakoutPrice = close;
        break;
      }
      if (close < orLow) {
        direction = "BEARISH";
        breakoutPrice = close;
        break;
      }
    }
    if (!direction || breakoutPrice === null) continue;

    const beatsPrior = direction === "BULLISH" ? breakoutPrice > priorHigh : breakoutPrice < priorLow;
    const beatsPre =
      direction === "BULLISH"
        ? premarketHigh !== null && breakoutPrice > premarketHigh
        : premarketLow !== null && breakoutPrice < premarketLow;

    let c: Confirmation;
    if (beatsPrior && beatsPre) c = "both";
    else if (beatsPrior) c = "priorday_only";
    else if (beatsPre) c = "premarket_only";
    else c = "neither";

    classification.set(date, c);
  }

  return classification;
}

function summarize(rows: { pnl: number }[]): string {
  if (rows.length === 0) return "no trades";
  const wins = rows.filter((r) => r.pnl > 0).length;
  const totalPnl = rows.reduce((s, r) => s + r.pnl, 0);
  const wr = ((wins / rows.length) * 100).toFixed(1);
  const avg = (totalPnl / rows.length).toFixed(2);
  return `${rows.length} trades  ${wr}% WR  $${totalPnl.toFixed(2)} total  $${avg} avg/trade`;
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const baseSettings: TradingSettings = settingsJson.data;

  const bySymbol = loadAllBars();

  for (const symbol of SYMBOLS) {
    const bars = bySymbol.get(symbol);
    if (!bars || bars.length === 0) {
      console.log(`\n=== ${symbol}: no data ===`);
      continue;
    }

    const classification = classifyDays(bars);

    const regCandles = bars.filter((b) => b.session === "reg").map(toCandle);

    const result = runBacktest({
      symbol,
      candles: regCandles,
      settings: baseSettings,
      startingEquity: 10000,
    });

    const buckets: Record<Confirmation, { pnl: number }[]> = {
      both: [],
      priorday_only: [],
      premarket_only: [],
      neither: [],
    };

    for (const trade of result.trades) {
      const c = classification.get(trade.date);
      if (!c) continue;
      buckets[c].push({ pnl: trade.pnl });
    }

    console.log(`\n=== ${symbol} — REAL backtest engine (FIBONACCI_ONLY, stop/target, EOD exit), full year ===`);
    console.log(`  overall: ${result.totalTrades} trades  ${result.winRate.toFixed(1)}% WR  $${result.totalPnl.toFixed(2)} total`);
    console.log(`  both (premarket + prior-day):   ${summarize(buckets.both)}`);
    console.log(`  priorday_only:                  ${summarize(buckets.priorday_only)}`);
    console.log(`  premarket_only:                 ${summarize(buckets.premarket_only)}`);
    console.log(`  neither:                        ${summarize(buckets.neither)}`);
  }
}

main();
