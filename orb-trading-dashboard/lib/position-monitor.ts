import { parseUtcSpaceDatetime } from "@/lib/market-hours";
import type { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import type { TradeRepository } from "@/lib/repositories/trade-repository";
import type { Trade } from "@/types/trading";

interface QuoteClient {
  getQuote(symbol: string): Promise<{ price: number }>;
}

export interface PositionMonitorDeps {
  tradeRepo: TradeRepository;
  dailyStatsRepo: DailyStatsRepository;
  marketDataClient: QuoteClient;
}

/**
 * Force-closes any open trade that has been held past `maxHoldMinutes`,
 * at the current market price, instead of letting it ride to end of day.
 * Backtesting showed this materially improves win rate for this strategy.
 * A null limit disables this entirely (ride to end of day, as before).
 */
export async function autoCloseExpiredPositions(
  deps: PositionMonitorDeps,
  userId: string,
  maxHoldMinutes: number | null,
): Promise<Trade[]> {
  if (maxHoldMinutes === null) {
    return [];
  }

  const openTrades = deps.tradeRepo.findOpenByUser(userId);
  const closedTrades: Trade[] = [];

  for (const trade of openTrades) {
    const ageMinutes = (Date.now() - parseUtcSpaceDatetime(trade.createdAt)) / 60_000;
    if (ageMinutes < maxHoldMinutes) {
      continue;
    }

    const quote = await deps.marketDataClient.getQuote(trade.symbol);
    const pnl =
      trade.side === "BUY"
        ? (quote.price - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - quote.price) * trade.quantity;

    const closed = deps.tradeRepo.close(trade.id, quote.price, pnl, "CLOSED");
    deps.dailyStatsRepo.recordTradeResult(userId, pnl);
    closedTrades.push(closed);
  }

  return closedTrades;
}
