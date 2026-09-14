import { NextResponse } from "next/server";
import { checkApiAuth } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { getSymbolSnapshot } from "@/lib/market-data";

export async function GET(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");

  if (!symbol) {
    return NextResponse.json({ success: false, error: "symbol query param is required" }, { status: 400 });
  }

  try {
    const client = createMarketDataClientFromEnv();
    const snapshot = await getSymbolSnapshot(client, symbol);
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch market data";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
