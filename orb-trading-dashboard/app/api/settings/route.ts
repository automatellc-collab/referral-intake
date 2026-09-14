import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { SettingsRepository } from "@/lib/repositories/settings-repository";
import type { TradingSettings } from "@/types/trading";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const userId = resolveProfileId(searchParams.get("profile"));

  const settings = new SettingsRepository().get(userId);
  return NextResponse.json({ success: true, data: settings });
}

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const body = (await request.json()) as Partial<TradingSettings> & { profile?: string };
  const userId = resolveProfileId(body.profile);
  const repo = new SettingsRepository();
  const current = repo.get(userId);

  const updated = repo.upsert({ ...current, ...body, userId });
  return NextResponse.json({ success: true, data: updated });
}
