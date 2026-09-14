/**
 * Validates the 200-day SMA rejection strategy (lib/sma-rejection-strategy.ts)
 * against real data before trusting it for live/real-money trades — exactly
 * the walk-forward-style check the ORB strategy never got.
 *
 * For each Mag 7 symbol:
 *  - Daily closes (Yahoo, cheap/no cap) to compute a genuine ROLLING 200-day
 *    SMA per trading day — each day's SMA uses only closes strictly BEFORE
 *    that day, matching what would actually be knowable intraday live.
 *  - 5-min intraday candles for this calendar year (Twelve Data, paginated —
 *    Yahoo's free 5-min data is capped at ~60 days, not enough for YTD).
 * One trade/day/symbol (first rejection signal only), held to end of day.
 *
 * Usage: npx tsx scripts/sma-rejection-backtest.ts
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { getEasternDateString } from "../lib/market-hours";
import { calculateSMA, detectSMARejection } from "../lib/sma-rejection-strategy";
import type { Candle, ORBDirection } from "../types/trading";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnvLocal();

const MAG_7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];
const SMA_PERIOD = 200;
// "This whole year" = year-to-date on the current run date.
const YTD_START = new Date(new Date().getFullYear(), 0, 1).getTime();
const TARGET_DAYS = Math.ceil((Date.now() - YTD_START) / (24 * 60 * 60 * 1000)) + 5;

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;

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

// Module-level (not per-symbol) so consecutive requests across DIFFERENT
// symbols also respect the 8 req/min cap — a symbol that only needs 1-2
// chunks would otherwise finish fast and let the next symbol's first
// request land right on top of the previous symbol's last one.
const MIN_REQUEST_SPACING_MS = 8500; // small safety margin over the 8 req/min cap
let lastRequestAt = 0;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_SPACING_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_SPACING_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function fetchChunk(symbol: string, endDate: string | null): Promise<RawValue[]> {
  await waitForRateLimit();

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "5min");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", TWELVE_DATA_API_KEY as string);
  if (endDate) url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "error") {
    throw new Error(`Twelve Data error for ${symbol}: ${json.message}`);
  }
  return json.values ?? [];
}

async function fetchYtdIntraday(symbol: string): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const cutoff = YTD_START;

  for (let i = 0; i < 6; i++) {
    const chunk = await fetchChunk(symbol, endDate);
    if (chunk.length === 0) break;
    allValues.push(...chunk);

    const oldest = chunk[chunk.length - 1].datetime;
    const oldestMs = Date.parse(`${oldest.replace(" ", "T")}Z`);
    if (oldestMs <= cutoff) break;

    const prevDay = new Date(oldestMs - 24 * 60 * 60 * 1000);
    endDate = prevDay.toISOString().slice(0, 10);
  }

  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (const v of allValues) {
    const c = toCandle(v);
    if (c.timestamp >= cutoff && !seen.has(c.timestamp)) {
      seen.add(c.timestamp);
      candles.push(c);
    }
  }
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

interface Trade {
  symbol: string;
  date: string;
  direction: ORBDirection;
  entryPrice: number;
  exitPrice: number;
  pnlPerShare: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "END_OF_DAY" | "TIME_EXIT";
  entryAt: number;
  exitAt: number;
  holdMinutes: number;
}

const CANDLE_MINUTES = 5;

function simulateExit(
  direction: ORBDirection,
  stopLoss: number,
  takeProfit: number,
  remainingCandles: Candle[],
  maxHoldMinutes?: number,
): { price: number; reason: Trade["exitReason"]; timestamp: number } {
  const maxHoldBars = maxHoldMinutes !== undefined ? Math.max(1, Math.round(maxHoldMinutes / CANDLE_MINUTES)) : undefined;
  const candlesToHold = maxHoldBars !== undefined ? remainingCandles.slice(0, maxHoldBars) : remainingCandles;

  for (const candle of candlesToHold) {
    if (direction === "BULLISH") {
      if (candle.low <= stopLoss) return { price: stopLoss, reason: "STOP_LOSS", timestamp: candle.timestamp };
      if (candle.high >= takeProfit) return { price: takeProfit, reason: "TAKE_PROFIT", timestamp: candle.timestamp };
    } else {
      if (candle.high >= stopLoss) return { price: stopLoss, reason: "STOP_LOSS", timestamp: candle.timestamp };
      if (candle.low <= takeProfit) return { price: takeProfit, reason: "TAKE_PROFIT", timestamp: candle.timestamp };
    }
  }
  const last = candlesToHold[candlesToHold.length - 1];
  const heldFullDay = maxHoldBars === undefined || candlesToHold.length === remainingCandles.length;
  return { price: last.close, reason: heldFullDay ? "END_OF_DAY" : "TIME_EXIT", timestamp: last.timestamp };
}

function backtestSymbol(
  symbol: string,
  dailyCloses: { date: string; close: number }[],
  intraday: Candle[],
  maxHoldMinutes?: number,
): Trade[] {
  const trades: Trade[] = [];
  const byDate = new Map<string, Candle[]>();
  for (const c of intraday) {
    const date = getEasternDateString(c.timestamp);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(c);
  }

  const closesByDate = new Map(dailyCloses.map((d) => [d.date, d.close]));
  const sortedDates = [...dailyCloses.map((d) => d.date)].sort();

  for (const [date, candles] of byDate) {
    // SMA200 as of this date uses only closes strictly BEFORE this date —
    // what would actually be known intraday, not a look-ahead value.
    const priorCloses = sortedDates.filter((d) => d < date).map((d) => closesByDate.get(d)!);
    if (priorCloses.length < SMA_PERIOD) continue;

    const sma200 = calculateSMA(priorCloses, SMA_PERIOD);
    const dayCandles = [...candles].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < dayCandles.length; i++) {
      const signal = detectSMARejection(dayCandles[i], sma200);
      if (!signal) continue;

      const remaining = dayCandles.slice(i + 1);
      if (remaining.length === 0) break; // no room left in the day to hold the trade

      const exit = simulateExit(signal.direction, signal.stopLoss, signal.takeProfit, remaining, maxHoldMinutes);
      const pnlPerShare =
        signal.direction === "BULLISH" ? exit.price - signal.price : signal.price - exit.price;

      trades.push({
        symbol,
        date,
        direction: signal.direction,
        entryPrice: signal.price,
        exitPrice: exit.price,
        pnlPerShare,
        exitReason: exit.reason,
        entryAt: signal.detectedAt,
        exitAt: exit.timestamp,
        holdMinutes: (exit.timestamp - signal.detectedAt) / 60_000,
      });
      break; // one trade per symbol per day
    }
  }

  return trades;
}

function printStats(label: string, trades: Trade[]): void {
  if (trades.length === 0) {
    console.log(`${label}: 0 trades`);
    return;
  }
  const wins = trades.filter((t) => t.pnlPerShare > 0).length;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnlPerShare, 0);
  const winRate = (wins / trades.length) * 100;
  const byReason: Record<string, number> = {};
  for (const t of trades) byReason[t.exitReason] = (byReason[t.exitReason] ?? 0) + 1;

  const holds = trades.map((t) => t.holdMinutes).sort((a, b) => a - b);
  const avgHold = holds.reduce((sum, h) => sum + h, 0) / holds.length;
  const medianHold = holds[Math.floor(holds.length / 2)];
  const byReasonHold: Record<string, number[]> = {};
  for (const t of trades) (byReasonHold[t.exitReason] ??= []).push(t.holdMinutes);
  const avgHoldByReason = Object.fromEntries(
    Object.entries(byReasonHold).map(([reason, mins]) => [
      reason,
      `${(mins.reduce((s, m) => s + m, 0) / mins.length).toFixed(0)}min avg`,
    ]),
  );

  console.log(
    `${label}: ${trades.length} trades, ${wins}W/${trades.length - wins}L, ` +
      `win rate ${winRate.toFixed(1)}%, total P&L ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}/share, ` +
      `avg $${(totalPnl / trades.length).toFixed(2)}/share — exits: ${JSON.stringify(byReason)}`,
  );
  console.log(
    `  hold time: avg ${avgHold.toFixed(0)}min, median ${medianHold.toFixed(0)}min, ` +
      `range ${holds[0].toFixed(0)}-${holds[holds.length - 1].toFixed(0)}min — by exit: ${JSON.stringify(avgHoldByReason)}`,
  );
}

// Candidates informed by the no-cap run: median hold ~10min, stop-outs
// resolve in ~13-21min avg, take-profits in ~64-73min avg — bracket that
// range plus a no-cap baseline for comparison.
const HOLD_MINUTES_OPTIONS: (number | undefined)[] = [undefined, 15, 30, 40, 60, 90];

async function main() {
  if (!TWELVE_DATA_API_KEY) {
    console.error("TWELVE_DATA_API_KEY not set — needed for >60 days of 5-min intraday history.");
    process.exit(1);
  }

  console.log(
    `Fetching 200-day SMA rejection data, YTD (${new Date(YTD_START).toISOString().slice(0, 10)} to today), ` +
      `${MAG_7.length} symbols. This takes several minutes (rate-limited Twelve Data pagination); ` +
      `data is fetched once, then swept across ${HOLD_MINUTES_OPTIONS.length} hold-time caps.\n`,
  );

  const client = createMarketDataClientFromEnv();
  const perSymbolData: { symbol: string; dailyCloses: { date: string; close: number }[]; intraday: Candle[] }[] = [];

  for (const symbol of MAG_7) {
    console.log(`--- fetching ${symbol} ---`);
    const dailyCandles = await client.getHistoricals(symbol, "1day", TARGET_DAYS + SMA_PERIOD + 30);
    const dailyCloses = dailyCandles.map((c) => ({ date: getEasternDateString(c.timestamp), close: c.close }));

    const intraday = await fetchYtdIntraday(symbol);
    console.log(`  ${intraday.length} intraday candles, ${dailyCloses.length} daily closes`);
    perSymbolData.push({ symbol, dailyCloses, intraday });
  }

  for (const maxHoldMinutes of HOLD_MINUTES_OPTIONS) {
    console.log(`\n\n########## maxHoldMinutes = ${maxHoldMinutes ?? "none (end of day)"} ##########\n`);
    const allTrades: Trade[] = [];

    for (const { symbol, dailyCloses, intraday } of perSymbolData) {
      const trades = backtestSymbol(symbol, dailyCloses, intraday, maxHoldMinutes);
      printStats(symbol, trades);
      allTrades.push(...trades);
    }

    console.log(`\n--- COMBINED (maxHoldMinutes=${maxHoldMinutes ?? "none"}) ---`);
    printStats("ALL", allTrades);
    printStats("BULLISH only", allTrades.filter((t) => t.direction === "BULLISH"));
    printStats("BEARISH only", allTrades.filter((t) => t.direction === "BEARISH"));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
