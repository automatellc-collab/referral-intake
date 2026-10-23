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

// Real incident 2026-09-17: a 1DTE TSLA call was the largest position of
// the day (10 contracts) and also the fastest-decaying (theta -$1.20/day on
// a ~$1 contract) — size and time-risk were inversely related when they
// should track together. This scales risk down as expiration nears, since
// less time also means less room for the thesis to play out before theta
// eats the position regardless of direction.
function dteRiskMultiplier(daysToExpiration: number | undefined): number {
  if (daysToExpiration === undefined) return 1;
  if (daysToExpiration <= 1) return 0.5; // 0DTE/1DTE
  if (daysToExpiration <= 3) return 0.75;
  return 1;
}

interface PositionSizeInput {
  accountEquity: number;
  entryPrice: number;
  stopLoss: number;
  settings: TradingSettings;
  /** Days until the option contract's expiration, if known. Scales risk
   * down for near-dated contracts — see dteRiskMultiplier. Omit when sizing
   * the underlying equity signal itself (no expiration to weigh). */
  daysToExpiration?: number;
}

export function calculatePositionSize({
  accountEquity,
  entryPrice,
  stopLoss,
  settings,
  daysToExpiration,
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

  const riskAmountUsd =
    accountEquity * (settings.riskPerTradePct / 100) * dteRiskMultiplier(daysToExpiration);
  const uncappedQuantity = Math.floor(riskAmountUsd / stopDistance);
  const uncappedPositionValueUsd = uncappedQuantity * entryPrice;

  const cappedByMaxSpend = uncappedPositionValueUsd > settings.maxTradePerOrderUsd;
  // A high-priced stock (e.g. $700+/share) can make even 1 share exceed
  // maxTradePerOrderUsd — floor() would then zero out a trade the risk
  // sizing genuinely wanted. Buy 1 share instead of blocking outright; the
  // stop-loss risk is still bounded even though spend exceeds the cap.
  const quantity = cappedByMaxSpend
    ? Math.max(uncappedQuantity > 0 ? 1 : 0, Math.floor(settings.maxTradePerOrderUsd / entryPrice))
    : uncappedQuantity;

  return {
    quantity,
    riskAmountUsd,
    positionValueUsd: quantity * entryPrice,
    cappedByMaxSpend,
  };
}
