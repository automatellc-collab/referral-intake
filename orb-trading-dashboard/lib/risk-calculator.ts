import type {
  DailyLimitCheck,
  DailyStats,
  PositionSizeResult,
  TradingSettings,
} from "@/types/trading";

export function calculateDailyLossLimit(
  stats: DailyStats,
  settings: TradingSettings,
): DailyLimitCheck {
  const currentLossPct = Math.max(0, -stats.dailyPnlPct);

  if (stats.consecutiveLosses >= settings.maxConsecutiveLosses) {
    return {
      allowed: false,
      reason: `Circuit breaker: ${stats.consecutiveLosses} consecutive losses reached the max of ${settings.maxConsecutiveLosses}`,
      currentLossPct,
      limitPct: settings.dailyLossLimitPct,
    };
  }

  if (currentLossPct >= settings.dailyLossLimitPct) {
    return {
      allowed: false,
      reason: `Daily loss limit reached: down ${currentLossPct.toFixed(2)}% vs limit of ${settings.dailyLossLimitPct}%`,
      currentLossPct,
      limitPct: settings.dailyLossLimitPct,
    };
  }

  return {
    allowed: true,
    reason: null,
    currentLossPct,
    limitPct: settings.dailyLossLimitPct,
  };
}

interface PositionSizeInput {
  accountEquity: number;
  entryPrice: number;
  stopLoss: number;
  settings: TradingSettings;
}

export function calculatePositionSize({
  accountEquity,
  entryPrice,
  stopLoss,
  settings,
}: PositionSizeInput): PositionSizeResult {
  const stopDistance = Math.abs(entryPrice - stopLoss);

  if (stopDistance === 0) {
    return {
      quantity: 0,
      riskAmountUsd: 0,
      positionValueUsd: 0,
      cappedByMaxSpend: false,
    };
  }

  const riskAmountUsd = accountEquity * (settings.riskPerTradePct / 100);
  const uncappedQuantity = Math.floor(riskAmountUsd / stopDistance);
  const uncappedPositionValueUsd = uncappedQuantity * entryPrice;

  const cappedByMaxSpend = uncappedPositionValueUsd > settings.maxTradePerOrderUsd;
  const quantity = cappedByMaxSpend
    ? Math.floor(settings.maxTradePerOrderUsd / entryPrice)
    : uncappedQuantity;

  return {
    quantity,
    riskAmountUsd,
    positionValueUsd: quantity * entryPrice,
    cappedByMaxSpend,
  };
}
