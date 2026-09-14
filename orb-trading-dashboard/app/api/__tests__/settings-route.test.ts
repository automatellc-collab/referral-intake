import { beforeEach, describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { resetDbForTests } from "@/lib/db";
import { GET, POST } from "@/app/api/settings/route";

beforeEach(() => {
  resetDbForTests(new Database(":memory:"));
});

describe("GET /api/settings", () => {
  test("returns default settings for a fresh user", async () => {
    const res = await GET(new Request("http://localhost/api/settings"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.mode).toBe("PAPER");
  });
});

describe("POST /api/settings", () => {
  test("updates and persists settings", async () => {
    const res = await POST(
      new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({ mode: "ALERTS", symbols: ["SPY"], dailyLossLimitPct: 3 }),
      }),
    );
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.data.mode).toBe("ALERTS");
    expect(json.data.symbols).toEqual(["SPY"]);

    const getRes = await GET(new Request("http://localhost/api/settings"));
    const getJson = await getRes.json();
    expect(getJson.data.mode).toBe("ALERTS");
  });
});

describe("API auth gate", () => {
  test("rejects requests without a bearer token when APP_ACCESS_TOKEN is set", async () => {
    process.env.APP_ACCESS_TOKEN = "secret123";
    try {
      const res = await GET(new Request("http://localhost/api/settings"));
      expect(res.status).toBe(401);
    } finally {
      delete process.env.APP_ACCESS_TOKEN;
    }
  });

  test("allows requests with the correct bearer token", async () => {
    process.env.APP_ACCESS_TOKEN = "secret123";
    try {
      const res = await GET(
        new Request("http://localhost/api/settings", {
          headers: { Authorization: "Bearer secret123" },
        }),
      );
      expect(res.status).toBe(200);
    } finally {
      delete process.env.APP_ACCESS_TOKEN;
    }
  });
});
