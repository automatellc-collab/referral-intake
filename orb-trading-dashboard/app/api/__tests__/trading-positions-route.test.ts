import { beforeEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import { TradeRepository } from "@/lib/repositories/trade-repository";
import { GET as getPositions } from "@/app/api/trading/positions/route";
import { GET as getHistory } from "@/app/api/trading/history/route";
import { POST as closePosition } from "@/app/api/trading/close/route";

beforeEach(() => {
  resetDbForTests(new Database(":memory:"));
});

describe("GET /api/trading/positions", () => {
  test("returns open trades for the default user", async () => {
    new TradeRepository().create({
      userId: "default",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 5,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });

    const res = await getPositions(new Request("http://localhost/api/trading/positions"));
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].symbol).toBe("SPY");
  });
});

describe("POST /api/trading/close", () => {
  test("closes an open trade, computes pnl, and updates daily stats", async () => {
    const trade = new TradeRepository().create({
      userId: "default",
      symbol: "SPY",
      side: "BUY",
      entryPrice: 100,
      quantity: 5,
      stopLoss: 95,
      takeProfit: 115,
      mode: "PAPER",
    });

    const res = await closePosition(
      new Request("http://localhost/api/trading/close", {
        method: "POST",
        body: JSON.stringify({ tradeId: trade.id, exitPrice: 110 }),
      }),
    );
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.status).toBe("CLOSED");
    expect(json.data.pnl).toBe(50); // (110-100)*5

    const historyRes = await getHistory(new Request("http://localhost/api/trading/history"));
    const historyJson = await historyRes.json();
    expect(historyJson.data).toHaveLength(1);

    const openRes = await getPositions(new Request("http://localhost/api/trading/positions"));
    const openJson = await openRes.json();
    expect(openJson.data).toHaveLength(0);
  });

  test("returns 404 for an unknown trade id", async () => {
    const res = await closePosition(
      new Request("http://localhost/api/trading/close", {
        method: "POST",
        body: JSON.stringify({ tradeId: "does-not-exist", exitPrice: 100 }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
