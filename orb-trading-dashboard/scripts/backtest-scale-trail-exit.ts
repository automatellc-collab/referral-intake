/**
 * Compares the current all-or-nothing exit (simulateExit) against the
 * Somesh/Kay Capitals-style scale-out + trail exit (simulateScaleOutTrailExit)
 * on real FIBONACCI_ONLY ORB entries, full year, per symbol.
 *
 * Usage: npx tsx scripts/backtest-scale-trail-exit.ts SPY [SYMBOL...]
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  simulateExit,
  simulateScaleOutTrailExit,
  type ScaleOutTrailLeg,
} from "../lib/backtest-engine";
import { buildOpeningRange, findQualifyingBreakout, getEntrySignal } from "../lib/orb-strategy";
import { calculatePositionSize } from "../lib/risk-calculator";
import { getEasternDateString } from "../lib/market-hours";
import type { Candle, TradingSettings } from "../types/trading";

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
const STARTING_EQUITY = 10000;

const SETTINGS: TradingSettings = {
  userId: "backtest",
  mode: "PAPER",
  symbols: [],
  dailyLossLimitPct: 100,
  riskPerTradePct: 1,
  maxOpenPositions: 1,
  riskRewardRatio: 3,
  stopLossBufferPct: 0,
  maxConsecutiveLosses: 100,
  maxTradePerOrderUsd: 100000,
  maxDailySpendUsd: 1000000,
  fibonacciAnchorMode: "OPENING_RANGE",
  entryTypeFilter: "FIBONACCI_ONLY",
  maxHoldMinutes: null,
  useElevenAmSwitch: false,
  requireHighQualityBreakout: false,
};

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

function groupByEasternDate(candles: Candle[]): Map<string, Candle[]> {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const groups = new Map<string, Candle[]>();
  for (const c of sorted) {
    const date = getEasternDateString(c.timestamp);
    const existing = groups.get(date) ?? [];
    existing.push(c);
    groups.set(date, existing);
  }
  return groups;
}

function legsToPnl(
  direction: "BULLISH" | "BEARISH",
  entryPrice: number,
  quantity: number,
  legs: ScaleOutTrailLeg[],
): { pnl: number; exitPrice: number; reasons: string[] } {
  let pnl = 0;
  let weightedExit = 0;
  const reasons: string[] = [];
  for (const leg of legs) {
    const legQty = quantity * leg.portion;
    pnl += direction === "BULLISH" ? (leg.price - entryPrice) * legQty : (entryPrice - leg.price) * legQty;
    weightedExit += leg.price * leg.portion;
    reasons.push(leg.reason);
  }
  return { pnl, exitPrice: weightedExit, reasons };
}

async function backtestSymbol(symbol: string): Promise<void> {
  console.log(`\nAssembling ~${TARGET_DAYS} days of ${symbol} 5-min candles...`);
  const candles = await fetchFullYear(symbol);
  console.log(`  assembled ${candles.length} candles`);

  const dayGroups = groupByEasternDate(candles);

  let currentEquity = STARTING_EQUITY;
  let scaleTrailEquity = STARTING_EQUITY;
  let currentTrades = 0;
  let currentWins = 0;
  let scaleTrailTrades = 0;
  let scaleTrailWins = 0;

  for (const [date, dayCandles] of dayGroups) {
    const openingRange = buildOpeningRange(symbol, date, dayCandles);
    if (!openingRange) continue;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    const signal = findQualifyingBreakout(dayCandles, openingRange, SETTINGS);
    if (!signal) continue;
    const breakoutIndex = postRangeCandles.findIndex((c) => c.timestamp === signal.breakoutAt);
    if (breakoutIndex === -1) continue;

    let entry = null;
    let entryIndex = -1;
    const candlesSinceBreakout: Candle[] = [];
    for (let i = breakoutIndex; i < postRangeCandles.length; i++) {
      candlesSinceBreakout.push(postRangeCandles[i]);
      const found = getEntrySignal(signal, candlesSinceBreakout, SETTINGS);
      if (found) {
        entry = found;
        entryIndex = i;
        break;
      }
    }
    if (!entry || entryIndex === -1) continue;

    const remainingCandles = postRangeCandles.slice(entryIndex + 1);
    if (remainingCandles.length === 0) continue;

    const positionSize = calculatePositionSize({
      accountEquity: currentEquity,
      entryPrice: entry.price,
      stopLoss: entry.stopLoss,
      settings: SETTINGS,
    });
    if (positionSize.quantity <= 0) continue;

    // Current (validated) policy: single all-or-nothing exit at the full
    // riskRewardRatio target.
    const currentExit = simulateExit(entry.direction, entry.stopLoss, entry.takeProfit, remainingCandles);
    const currentPnl =
      entry.direction === "BULLISH"
        ? (currentExit.price - entry.price) * positionSize.quantity
        : (entry.price - currentExit.price) * positionSize.quantity;
    currentEquity += currentPnl;
    currentTrades++;
    if (currentPnl > 0) currentWins++;

    // Scale-out + trail policy: half out at 1R, breakeven stop + swing trail
    // on the remainder.
    const riskPerShare = Math.abs(entry.price - entry.stopLoss);
    const firstTarget = entry.direction === "BULLISH" ? entry.price + riskPerShare : entry.price - riskPerShare;
    const legs = simulateScaleOutTrailExit(
      entry.direction,
      entry.price,
      entry.stopLoss,
      firstTarget,
      remainingCandles,
    );
    const { pnl: scaleTrailPnl } = legsToPnl(entry.direction, entry.price, positionSize.quantity, legs);
    scaleTrailEquity += scaleTrailPnl;
    scaleTrailTrades++;
    if (scaleTrailPnl > 0) scaleTrailWins++;
  }

  console.log(`\n=== ${symbol} — exit policy comparison, FULL YEAR (FIBONACCI_ONLY) ===`);
  console.log(
    `CURRENT (all-or-nothing @ ${SETTINGS.riskRewardRatio}R):  ${currentTrades} trades, ` +
      `${currentTrades === 0 ? 0 : ((currentWins / currentTrades) * 100).toFixed(1)}% WR, ` +
      `total P&L $${(currentEquity - STARTING_EQUITY).toFixed(2)}`,
  );
  console.log(
    `SCALE-OUT+TRAIL (50% @ 1R, trail rest): ${scaleTrailTrades} trades, ` +
      `${scaleTrailTrades === 0 ? 0 : ((scaleTrailWins / scaleTrailTrades) * 100).toFixed(1)}% WR, ` +
      `total P&L $${(scaleTrailEquity - STARTING_EQUITY).toFixed(2)}`,
  );
}

async function main() {
  const symbols = process.argv.slice(2);
  if (symbols.length === 0) {
    console.error("Usage: npx tsx scripts/backtest-scale-trail-exit.ts SYMBOL [SYMBOL...]");
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
