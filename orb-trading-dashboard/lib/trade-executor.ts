import { calculateDailyLossLimit, calculatePositionSize } from "@/lib/risk-calculator";
import type { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import type { TradeRepository } from "@/lib/repositories/trade-repository";
import type { EntrySignal, PositionSizeResult, Trade, TradeSide, TradingSettings } from "@/types/trading";

interface RobinhoodOrderClient {
  placeEquityOrder(order: { symbol: string; side: TradeSide; quantity: number }): Promise<unknown>;
}

export interface TradeExecutorDeps {
  tradeRepo: TradeRepository;
  dailyStatsRepo: DailyStatsRepository;
  robinhoodClient?: RobinhoodOrderClient;
}

export interface ExecuteEntrySignalInput {
  userId: string;
  entry: EntrySignal;
  settings: TradingSettings;
  accountEquity: number;
}

export type ExecutionStatus = "EXECUTED" | "ALERTED" | "BLOCKED";

export interface ExecuteEntrySignalResult {
  status: ExecutionStatus;
  trade?: Trade;
  reason?: string;
  positionSize?: PositionSizeResult;
}

export async function executeEntrySignal(
  deps: TradeExecutorDeps,
  input: ExecuteEntrySignalInput,
): Promise<ExecuteEntrySignalResult> {
  const { tradeRepo, dailyStatsRepo, robinhoodClient } = deps;
  const { userId, entry, settings, accountEquity } = input;

  const dailyStats = dailyStatsRepo.getOrCreateToday(userId, accountEquity);
  const limitCheck = calculateDailyLossLimit(dailyStats, settings);
  if (!limitCheck.allowed) {
    return { status: "BLOCKED", reason: limitCheck.reason ?? "Daily loss limit reached" };
  }

  const openPositions = tradeRepo.countOpenByUser(userId);
  if (openPositions >= settings.maxOpenPositions) {
    return {
      status: "BLOCKED",
      reason: `Max open positions (${settings.maxOpenPositions}) already reached`,
    };
  }

  // One entry per symbol per day. Without this, a sticky signal type
  // (RETEST stays "active" for the rest of the day once triggered) would
  // re-enter immediately every time the previous trade's time exit closes
  // it — real incident 2026-08-31, the same signal fired 3 times in a row.
  if (tradeRepo.hasTradedTodayForSymbol(userId, entry.symbol)) {
    return {
      status: "BLOCKED",
      reason: `Already traded ${entry.symbol} today — one entry per symbol per day`,
    };
  }

  const positionSize = calculatePositionSize({
    accountEquity,
    entryPrice: entry.price,
    stopLoss: entry.stopLoss,
    settings,
  });

  if (positionSize.quantity <= 0) {
    return {
      status: "BLOCKED",
      reason: "Computed position size is zero — stop distance or risk % too small for one share",
    };
  }

  const side: TradeSide = entry.direction === "BULLISH" ? "BUY" : "SELL";

  if (settings.mode === "PAPER") {
    const trade = tradeRepo.create({
      userId,
      symbol: entry.symbol,
      side,
      entryPrice: entry.price,
      quantity: positionSize.quantity,
      stopLoss: entry.stopLoss,
      takeProfit: entry.takeProfit,
      mode: "PAPER",
    });
    return { status: "EXECUTED", trade, positionSize };
  }

  if (settings.mode === "ALERTS") {
    return {
      status: "ALERTED",
      positionSize,
      reason: `${entry.type} entry signal detected for ${entry.symbol} at ${entry.price.toFixed(2)} — place this trade manually if you agree with it`,
    };
  }

  // AUTOMATED mode
  if (!robinhoodClient) {
    return {
      status: "BLOCKED",
      reason: "Robinhood client is not configured for automated execution. Set ROBINHOOD_* env vars or switch to PAPER/ALERTS mode.",
    };
  }

  try {
    await robinhoodClient.placeEquityOrder({
      symbol: entry.symbol,
      side,
      quantity: positionSize.quantity,
    });
  } catch (error) {
    return {
      status: "BLOCKED",
      reason: error instanceof Error ? error.message : "Automated order failed",
    };
  }

  const trade = tradeRepo.create({
    userId,
    symbol: entry.symbol,
    side,
    entryPrice: entry.price,
    quantity: positionSize.quantity,
    stopLoss: entry.stopLoss,
    takeProfit: entry.takeProfit,
    mode: "AUTOMATED",
  });

  return { status: "EXECUTED", trade, positionSize };
}
