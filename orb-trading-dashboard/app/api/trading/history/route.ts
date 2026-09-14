import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { TradeRepository } from "@/lib/repositories/trade-repository";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const userId = resolveProfileId(searchParams.get("profile"));

  const history = new TradeRepository().findHistoryByUser(userId);
  return NextResponse.json({ success: true, data: history });
}
