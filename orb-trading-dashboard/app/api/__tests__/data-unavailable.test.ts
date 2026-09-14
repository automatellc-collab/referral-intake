import { beforeEach, describe, expect, test, vi } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import type { SymbolSnapshot } from "@/lib/market-data";

vi.mock("@/lib/market-data-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/market-data-client")>(
    "@/lib/market-data-client",
  );
  return { ...actual, createMarketDataClientFromEnv: vi.fn().mockReturnValue({}) };
});

const { getSymbolSnapshot } = vi.hoisted(() => ({ getSymbolSnapshot: vi.fn() }));
vi.mock("@/lib/market-data", () => ({ getSymbolSnapshot }));

function staleSnapshot(): SymbolSnapshot {
  return {
    symbol: "SPY",
    quote: { symbol: "SPY", price: 500, timestamp: Date.now() },
    todayCandles: [],
    openingRange: null,
    dataHealth: { isLive: false, staleSinceMinutes: 25, openingRangeComplete: true },
  };
}

function gapSnapshot(): SymbolSnapshot {
  return {
    symbol: "SPY",
    quote: { symbol: "SPY", price: 500, timestamp: Date.now() },
    todayCandles: [],
    openingRange: null,
    dataHealth: { isLive: true, staleSinceMinutes: null, openingRangeComplete: false },
  };
}

beforeEach(() => {
  resetDbForTests(new Database(":memory:"));
  getSymbolSnapshot.mockReset();
});

describe("GET /api/trading/signal — data health", () => {
  test("reports DATA_UNAVAILABLE when the feed is stale, not NO_SIGNAL", async () => {
    getSymbolSnapshot.mockResolvedValue(staleSnapshot());
    const { GET } = await import("@/app/api/trading/signal/route");

    const res = await GET(new Request("http://localhost/api/trading/signal?symbol=SPY"));
    const json = await res.json();

    expect(json.data.status).toBe("DATA_UNAVAILABLE");
    expect(json.data.reason).toMatch(/stale/i);
  });

  test("reports DATA_UNAVAILABLE when the opening range has a data gap", async () => {
    getSymbolSnapshot.mockResolvedValue(gapSnapshot());
    const { GET } = await import("@/app/api/trading/signal/route");

    const res = await GET(new Request("http://localhost/api/trading/signal?symbol=SPY"));
    const json = await res.json();

    expect(json.data.status).toBe("DATA_UNAVAILABLE");
    expect(json.data.reason).toMatch(/missing/i);
  });
});

describe("POST /api/trading/execute — data health", () => {
  test("reports DATA_UNAVAILABLE instead of NO_SIGNAL when the feed has a data gap", async () => {
    getSymbolSnapshot.mockResolvedValue(gapSnapshot());
    const { POST } = await import("@/app/api/trading/execute/route");

    const res = await POST(
      new Request("http://localhost/api/trading/execute", {
        method: "POST",
        body: JSON.stringify({ symbol: "SPY", accountEquity: 10000 }),
      }),
    );
    const json = await res.json();

    expect(json.data.status).toBe("DATA_UNAVAILABLE");
    expect(json.data.reason).toMatch(/missing/i);
  });
});
