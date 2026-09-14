import { beforeEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import { DailyStatsRepository } from "@/lib/repositories/daily-stats-repository";
import { GET as getDailyLimit } from "@/app/api/risk/daily-limit/route";

beforeEach(() => {
  resetDbForTests(new Database(":memory:"));
});

describe("GET /api/risk/daily-limit", () => {
  test("allows trading when no losses have occurred yet", async () => {
    const res = await getDailyLimit(
      new Request("http://localhost/api/risk/daily-limit?accountEquity=10000"),
    );
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.check.allowed).toBe(true);
  });

  test("blocks trading once the configured daily loss limit is breached", async () => {
    new DailyStatsRepository().getOrCreateToday("default", 10000);
    new DailyStatsRepository().recordTradeResult("default", -500); // -5%, past default 2% limit

    const res = await getDailyLimit(
      new Request("http://localhost/api/risk/daily-limit?accountEquity=10000"),
    );
    const json = await res.json();

    expect(json.data.check.allowed).toBe(false);
  });
});
