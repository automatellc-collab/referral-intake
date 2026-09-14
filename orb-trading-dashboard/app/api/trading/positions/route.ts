import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { autoCloseExpiredPositions } from "@/lib/position-monitor";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { SettingsRepository } from "@/lib/repositories/settings-repository";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const userId = resolveProfileId(searchParams.get("profile"));

  const tradeRepo = new TradeRepository();
  const settings = new SettingsRepository().get(userId);

  if (settings.maxHoldMinutes !== null) {
    try {
      await autoCloseExpiredPositions(
        { tradeRepo, dailyStatsRepo: new DailyStatsRepository(), marketDataClient: createMarketDataClientFromEnv() },
        userId,
        settings.maxHoldMinutes,
      );
    } catch {
      // Market data unavailable (e.g. not configured) — fall through and
      // return positions as-is rather than failing the whole request.
    }
  }

  const positions = tradeRepo.findOpenByUser(userId);
  return NextResponse.json({ success: true, data: positions });
}
