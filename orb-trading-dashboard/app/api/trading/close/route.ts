import { NextResponse } from "next/server";
import { checkApiAuth, resolveProfileId } from "@/lib/api-auth";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";

interface ClosePositionBody {
  tradeId: string;
  exitPrice: number;
  profile?: string;
}

export async function POST(request: Request) {
  const authError = checkApiAuth(request);
  if (authError) return authError;

  const body = (await request.json()) as ClosePositionBody;
  const userId = resolveProfileId(body.profile);
  const tradeRepo = new TradeRepository();

  const trade = tradeRepo.findById(body.tradeId);
  if (!trade || trade.userId !== userId) {
    return NextResponse.json({ success: false, error: "Trade not found" }, { status: 404 });
  }
  if (trade.status !== "OPEN") {
    return NextResponse.json({ success: false, error: "Trade is not open" }, { status: 400 });
  }

  const pnl =
    trade.side === "BUY"
      ? (body.exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - body.exitPrice) * trade.quantity;

  const closed = tradeRepo.close(trade.id, body.exitPrice, pnl, "CLOSED");
  new DailyStatsRepository().recordTradeResult(userId, pnl);

  return NextResponse.json({ success: true, data: closed });
}
