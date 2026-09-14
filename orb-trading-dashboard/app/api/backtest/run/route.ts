import { NextResponse } from "next/server";
import { DEFAULT_USER_ID, checkApiAuth } from "@/lib/api-auth";
import { createMarketDataClientFromEnv } from "@/lib/market-data-client";
import { runBacktest } from "@/lib/backtest-engine";
import { SettingsRepository } from "@/lib/repositories/settings-repository";

interface BacktestRequestBody {
  symbol: string;
  outputsize?: number; // number of 5-minute bars to fetch (~78 bars/trading day)
  startingEquity: number;
  maxHoldBars?: number; // cap trade duration in 5-minute bars instead of holding to end of day
}

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const body = (await request.json()) as BacktestRequestBody;

  if (!body.symbol || !body.startingEquity) {
    return NextResponse.json(
      { success: false, error: "symbol and startingEquity are required" },
      { status: 400 },
    );
  }

  try {
    const client = createMarketDataClientFromEnv();
    const candles = await client.getHistoricals(body.symbol, "5min", body.outputsize ?? 780);
    const settings = new SettingsRepository().get(DEFAULT_USER_ID);

    const result = runBacktest({
      symbol: body.symbol,
      candles,
      settings,
      startingEquity: body.startingEquity,
      maxHoldBars: body.maxHoldBars,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run backtest";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
