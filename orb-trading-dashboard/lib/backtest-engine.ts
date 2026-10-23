import { buildOpeningRange, findQualifyingBreakout, getEntrySignal } from "@/lib/orb-strategy";
import { getEasternDateString } from "@/lib/market-hours";
import { calculatePositionSize } from "@/lib/risk-calculator";
import type { Candle, EntryType, ORBDirection, ORBSignal, TradingSettings } from "@/types/trading";

function groupByEasternDate(candles: Candle[]): Map<string, Candle[]> {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const groups = new Map<string, Candle[]>();

  for (const candle of sorted) {
    const date = getEasternDateString(candle.timestamp);
    const existing = groups.get(date) ?? [];
    existing.push(candle);
    groups.set(date, existing);
  }

  return groups;
}

export interface BacktestTradeResult {
  date: string;
  direction: ORBDirection;
  entryType: EntryType;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "END_OF_DAY" | "TIME_EXIT";
  entryAt: number;
  exitAt: number;
}

export interface BacktestInput {
  symbol: string;
  candles: Candle[];
  settings: TradingSettings;
  startingEquity: number;
  /** Cap how many candles a trade stays open before forcing an exit at that candle's close (TIME_EXIT), instead of riding out to end of day. Omit to hold until end of day. */
  maxHoldBars?: number;
}

export interface BacktestResult {
  symbol: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgProfitPerTrade: number;
  maxDrawdownPct: number;
  endingEquity: number;
  trades: BacktestTradeResult[];
}

export function simulateExit(
  direction: ORBDirection,
  stopLoss: number,
  takeProfit: number,
  remainingCandles: Candle[],
  maxHoldBars?: number,
): { price: number; reason: BacktestTradeResult["exitReason"]; timestamp: number } {
  const candlesToHold =
    maxHoldBars !== undefined ? remainingCandles.slice(0, maxHoldBars) : remainingCandles;

  for (const candle of candlesToHold) {
    if (direction === "BULLISH") {
      if (candle.low <= stopLoss) return { price: stopLoss, reason: "STOP_LOSS", timestamp: candle.timestamp };
      if (candle.high >= takeProfit) return { price: takeProfit, reason: "TAKE_PROFIT", timestamp: candle.timestamp };
    } else {
      if (candle.high >= stopLoss) return { price: stopLoss, reason: "STOP_LOSS", timestamp: candle.timestamp };
      if (candle.low <= takeProfit) return { price: takeProfit, reason: "TAKE_PROFIT", timestamp: candle.timestamp };
    }
  }

  const lastCandle = candlesToHold[candlesToHold.length - 1];
  const heldFullDay = maxHoldBars === undefined || candlesToHold.length === remainingCandles.length;
  return {
    price: lastCandle.close,
    reason: heldFullDay ? "END_OF_DAY" : "TIME_EXIT",
    timestamp: lastCandle.timestamp,
  };
}

// Somesh/Kay Capitals profit-taking rules (see data/trade-log.md council
// note, 2026-09-30): sell half the position at the first 1R target, move the
// stop on the remainder to breakeven, then trail that remainder's stop to
// each new favorable swing extreme instead of exiting it all at one static
// take-profit. Exploratory — gated behind this separate function so it can
// never change the validated all-or-nothing `simulateExit` path unless a
// backtest shows it should.
export interface ScaleOutTrailLeg {
  price: number;
  reason: "FIRST_TARGET" | "STOP_LOSS" | "BREAKEVEN_STOP" | "TRAIL_STOP" | "END_OF_DAY" | "TIME_EXIT";
  timestamp: number;
  /** Fraction of the original position this leg closes (0.5 or 1). */
  portion: number;
}

export function simulateScaleOutTrailExit(
  direction: ORBDirection,
  entryPrice: number,
  stopLoss: number,
  firstTarget: number,
  remainingCandles: Candle[],
  maxHoldBars?: number,
): ScaleOutTrailLeg[] {
  const candlesToHold =
    maxHoldBars !== undefined ? remainingCandles.slice(0, maxHoldBars) : remainingCandles;
  if (candlesToHold.length === 0) return [];

  const isBullish = direction === "BULLISH";
  const breached = (price: number, stop: number) => (isBullish ? price <= stop : price >= stop);
  const reached = (price: number, target: number) => (isBullish ? price >= target : price <= target);

  let currentStop = stopLoss;
  let scaledOut = false;

  for (let i = 0; i < candlesToHold.length; i++) {
    const candle = candlesToHold[i];
    const low = isBullish ? candle.low : candle.high;
    const high = isBullish ? candle.high : candle.low;

    if (!scaledOut) {
      if (breached(low, currentStop)) {
        return [{ price: currentStop, reason: "STOP_LOSS", timestamp: candle.timestamp, portion: 1 }];
      }
      if (reached(high, firstTarget)) {
        scaledOut = true;
        currentStop = entryPrice;
        const firstLeg: ScaleOutTrailLeg = {
          price: firstTarget,
          reason: "FIRST_TARGET",
          timestamp: candle.timestamp,
          portion: 0.5,
        };
        const heldFullDayAfterTarget = i === candlesToHold.length - 1;
        if (heldFullDayAfterTarget) {
          return [
            firstLeg,
            {
              price: candle.close,
              reason: maxHoldBars !== undefined && candlesToHold.length === maxHoldBars ? "TIME_EXIT" : "END_OF_DAY",
              timestamp: candle.timestamp,
              portion: 0.5,
            },
          ];
        }
        continue;
      }
      continue;
    }

    // Trail the remainder's stop to the prior candle's extreme in the trade's
    // favor — never loosen it back toward entry if price pulls back.
    const prior = candlesToHold[i - 1];
    const priorExtreme = isBullish ? prior.low : prior.high;
    currentStop = isBullish ? Math.max(currentStop, priorExtreme) : Math.min(currentStop, priorExtreme);

    if (breached(low, currentStop)) {
      return [
        { price: firstTarget, reason: "FIRST_TARGET", timestamp: candlesToHold[0].timestamp, portion: 0.5 },
        {
          price: currentStop,
          reason: currentStop === entryPrice ? "BREAKEVEN_STOP" : "TRAIL_STOP",
          timestamp: candle.timestamp,
          portion: 0.5,
        },
      ];
    }
  }

  const lastCandle = candlesToHold[candlesToHold.length - 1];
  const heldFullDay = maxHoldBars === undefined || candlesToHold.length === remainingCandles.length;
  const exitReason = heldFullDay ? "END_OF_DAY" : "TIME_EXIT";

  if (!scaledOut) {
    return [{ price: lastCandle.close, reason: exitReason, timestamp: lastCandle.timestamp, portion: 1 }];
  }
  return [
    { price: firstTarget, reason: "FIRST_TARGET", timestamp: candlesToHold[0].timestamp, portion: 0.5 },
    { price: lastCandle.close, reason: exitReason, timestamp: lastCandle.timestamp, portion: 0.5 },
  ];
}

function findFirstBreakout(
  dayCandles: Candle[],
  postRangeCandles: Candle[],
  openingRange: NonNullable<ReturnType<typeof buildOpeningRange>>,
  settings: Pick<TradingSettings, "requireHighQualityBreakout">,
): { signal: ORBSignal; breakoutIndex: number } | null {
  const signal = findQualifyingBreakout(dayCandles, openingRange, settings);
  if (!signal) return null;

  const breakoutIndex = postRangeCandles.findIndex((c) => c.timestamp === signal.breakoutAt);
  if (breakoutIndex === -1) return null;

  return { signal, breakoutIndex };
}

function findFirstEntry(
  postRangeCandles: Candle[],
  breakoutIndex: number,
  signal: ORBSignal,
  settings: TradingSettings,
): { entry: NonNullable<ReturnType<typeof getEntrySignal>>; entryIndex: number } | null {
  const candlesSinceBreakout: Candle[] = [];

  for (let i = breakoutIndex; i < postRangeCandles.length; i++) {
    candlesSinceBreakout.push(postRangeCandles[i]);
    const entry = getEntrySignal(signal, candlesSinceBreakout, settings);
    if (entry) {
      return { entry, entryIndex: i };
    }
  }

  return null;
}

export function runBacktest(input: BacktestInput): BacktestResult {
  const { symbol, candles, settings, startingEquity, maxHoldBars } = input;
  const dayGroups = groupByEasternDate(candles);

  const trades: BacktestTradeResult[] = [];
  let runningEquity = startingEquity;
  let peakEquity = startingEquity;
  let maxDrawdownPct = 0;

  for (const [date, dayCandles] of dayGroups) {
    const openingRange = buildOpeningRange(symbol, date, dayCandles);
    if (!openingRange) continue;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    const breakout = findFirstBreakout(dayCandles, postRangeCandles, openingRange, settings);
    if (!breakout) continue;

    const found = findFirstEntry(postRangeCandles, breakout.breakoutIndex, breakout.signal, settings);
    if (!found) continue;

    const { entry, entryIndex } = found;
    const remainingCandles = postRangeCandles.slice(entryIndex + 1);
    if (remainingCandles.length === 0) continue;

    const positionSize = calculatePositionSize({
      accountEquity: runningEquity,
      entryPrice: entry.price,
      stopLoss: entry.stopLoss,
      settings,
    });
    if (positionSize.quantity <= 0) continue;

    const exit = simulateExit(entry.direction, entry.stopLoss, entry.takeProfit, remainingCandles, maxHoldBars);
    const pnl =
      entry.direction === "BULLISH"
        ? (exit.price - entry.price) * positionSize.quantity
        : (entry.price - exit.price) * positionSize.quantity;

    runningEquity += pnl;
    peakEquity = Math.max(peakEquity, runningEquity);
    const drawdownPct = peakEquity === 0 ? 0 : ((peakEquity - runningEquity) / peakEquity) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

    trades.push({
      date,
      direction: entry.direction,
      entryType: entry.type,
      entryPrice: entry.price,
      exitPrice: exit.price,
      quantity: positionSize.quantity,
      pnl,
      exitReason: exit.reason,
      entryAt: entry.detectedAt,
      exitAt: exit.timestamp,
    });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  return {
    symbol,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length === 0 ? 0 : (wins / trades.length) * 100,
    totalPnl,
    avgProfitPerTrade: trades.length === 0 ? 0 : totalPnl / trades.length,
    maxDrawdownPct,
    endingEquity: runningEquity,
    trades,
  };
}
