import { buildOpeningRange, detectBreakout, getEntrySignal } from "@/lib/orb-strategy";
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

function simulateExit(
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

function findFirstBreakout(
  postRangeCandles: Candle[],
  openingRange: NonNullable<ReturnType<typeof buildOpeningRange>>,
): { signal: ORBSignal; breakoutIndex: number } | null {
  for (let i = 0; i < postRangeCandles.length; i++) {
    const candle = postRangeCandles[i];
    const signal = detectBreakout(openingRange, candle.close, candle.timestamp);
    if (signal) {
      return { signal, breakoutIndex: i };
    }
  }
  return null;
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

    const breakout = findFirstBreakout(postRangeCandles, openingRange);
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
