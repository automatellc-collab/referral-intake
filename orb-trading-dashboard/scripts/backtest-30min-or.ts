/**
 * Backtests the ORB strategy with a 30-minute opening range (9:30-10:00 ET)
 * instead of the live 15-minute window (9:30-9:45), reusing the real
 * entry/exit logic (getEntrySignal, calculatePositionSize, simulateExit) —
 * only the opening-range construction differs. Full year, FIBONACCI_ONLY,
 * end-of-day exit (no time-stop), for direct comparison against the
 * standard 15-min-OR full-year backtest.
 *
 * Usage: npx tsx scripts/backtest-30min-or.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { detectBreakout, getEntrySignal } from "../lib/orb-strategy";
import { getEasternDateString, getEasternMinutesOfDay } from "../lib/market-hours";
import { calculatePositionSize } from "../lib/risk-calculator";
import { simulateExit, runBacktest } from "../lib/backtest-engine";
import type { Candle, OpeningRange, TradingSettings, ORBSignal } from "../types/trading";

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

const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 9:30
const OR_CLOSE_MINUTES_30 = 10 * 60; // 10:00 (30-min OR)

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

function build30MinOpeningRange(sym: string, date: string, candles: Candle[]): OpeningRange | null {
  const windowCandles = candles.filter((c) => {
    const m = getEasternMinutesOfDay(c.timestamp);
    return m >= MARKET_OPEN_MINUTES && m < OR_CLOSE_MINUTES_30;
  });
  if (windowCandles.length === 0) return null;
  const high = Math.max(...windowCandles.map((c) => c.high));
  const low = Math.min(...windowCandles.map((c) => c.low));
  const formedAt = windowCandles[windowCandles.length - 1].timestamp;
  if (high <= low) return null;
  return { symbol: sym, date, high, low, formedAt };
}

interface TradeResult {
  date: string;
  pnl: number;
}

function runBacktest30Min(symbolArg: string, candles: Candle[], settings: TradingSettings) {
  const dayGroups = groupByEasternDate(candles);
  const trades: TradeResult[] = [];
  let runningEquity = 10000;

  for (const [date, dayCandles] of dayGroups) {
    const openingRange = build30MinOpeningRange(symbolArg, date, dayCandles);
    if (!openingRange) continue;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    let breakoutIndex = -1;
    let breakoutSignal: ORBSignal | null = null;
    for (let i = 0; i < postRangeCandles.length; i++) {
      const signal = detectBreakout(openingRange, postRangeCandles[i].close, postRangeCandles[i].timestamp);
      if (signal) {
        breakoutIndex = i;
        breakoutSignal = signal;
        break;
      }
    }
    if (breakoutIndex === -1 || !breakoutSignal) continue;

    const candlesSinceBreakout: Candle[] = [];
    let entryIndex = -1;
    let entry: NonNullable<ReturnType<typeof getEntrySignal>> | null = null;
    for (let i = breakoutIndex; i < postRangeCandles.length; i++) {
      candlesSinceBreakout.push(postRangeCandles[i]);
      const found = getEntrySignal(breakoutSignal, candlesSinceBreakout, settings);
      if (found) {
        entry = found;
        entryIndex = i;
        break;
      }
    }
    if (entryIndex === -1 || !entry) continue;

    const remainingCandles = postRangeCandles.slice(entryIndex + 1);
    if (remainingCandles.length === 0) continue;

    const positionSize = calculatePositionSize({
      accountEquity: runningEquity,
      entryPrice: entry.price,
      stopLoss: entry.stopLoss,
      settings,
    });
    if (positionSize.quantity <= 0) continue;

    const exit = simulateExit(entry.direction, entry.stopLoss, entry.takeProfit, remainingCandles);
    const pnl =
      entry.direction === "BULLISH"
        ? (exit.price - entry.price) * positionSize.quantity
        : (entry.price - exit.price) * positionSize.quantity;

    runningEquity += pnl;
    trades.push({ date, pnl });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  return { totalTrades: trades.length, wins, losses, winRate, totalPnl, avgProfitPerTrade: trades.length > 0 ? totalPnl / trades.length : 0 };
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settings: TradingSettings = { ...(await settingsRes.json()).data, entryTypeFilter: "FIBONACCI_ONLY" };

  console.log(`Assembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...\n`);
  const candles = await fetchFullYear();
  console.log(`\nAssembled ${candles.length} candles\n`);

  const result30 = runBacktest30Min(symbol, candles, settings);
  const result15 = runBacktest({ symbol, candles, settings, startingEquity: 10000 });

  console.log(`=== ${symbol} — opening-range width comparison, FIBONACCI_ONLY, EOD exit ===\n`);
  console.log("OR width".padEnd(12), "trades".padEnd(8), "wins".padEnd(6), "losses".padEnd(8), "winRate".padEnd(9), "totalPnl".padEnd(11), "avgPnl");
  console.log(
    "15-min (live)".padEnd(12),
    String(result15.totalTrades).padEnd(8),
    String(result15.wins).padEnd(6),
    String(result15.losses).padEnd(8),
    (result15.winRate.toFixed(1) + "%").padEnd(9),
    ("$" + result15.totalPnl.toFixed(2)).padEnd(11),
    "$" + result15.avgProfitPerTrade.toFixed(2),
  );
  console.log(
    "30-min".padEnd(12),
    String(result30.totalTrades).padEnd(8),
    String(result30.wins).padEnd(6),
    String(result30.losses).padEnd(8),
    (result30.winRate.toFixed(1) + "%").padEnd(9),
    ("$" + result30.totalPnl.toFixed(2)).padEnd(11),
    "$" + result30.avgProfitPerTrade.toFixed(2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
