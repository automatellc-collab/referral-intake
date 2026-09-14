import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { SettingsRepository } from "@/lib/repositories/settings-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { calculateDailyLossLimit } from "@/lib/risk-calculator";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const accountEquity = Number(searchParams.get("accountEquity") ?? "10000");
  const userId = resolveProfileId(searchParams.get("profile"));

  const settings = new SettingsRepository().get(userId);
  const stats = new DailyStatsRepository().getOrCreateToday(userId, accountEquity);
  const check = calculateDailyLossLimit(stats, settings);

  return NextResponse.json({ success: true, data: { stats, check } });
}
