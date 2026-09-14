import { describe, expect, test } from "vitest";
import {
  buildEquityOrderPayload,
  RobinhoodClient,
  RobinhoodNotConfiguredError,
} from "@/lib/robinhood-client";

describe("buildEquityOrderPayload", () => {
  test("builds a market buy order payload", () => {
    const payload = buildEquityOrderPayload({
      accountUrl: "https://api.robinhood.com/accounts/ABC123/",
      instrumentUrl: "https://api.robinhood.com/instruments/xyz/",
      symbol: "SPY",
      side: "BUY",
      quantity: 10,
    });

    expect(payload).toMatchObject({
      account: "https://api.robinhood.com/accounts/ABC123/",
      instrument: "https://api.robinhood.com/instruments/xyz/",
      symbol: "SPY",
      side: "buy",
      quantity: "10",
      type: "market",
      time_in_force: "gfd",
      trigger: "immediate",
    });
  });
});

describe("RobinhoodClient.placeEquityOrder", () => {
  test("refuses when liveTradingEnabled is false, even with credentials", async () => {
    const client = new RobinhoodClient({
      username: "user",
      password: "pass",
      liveTradingEnabled: false,
    });

    await expect(
      client.placeEquityOrder({ symbol: "SPY", side: "BUY", quantity: 1 }),
    ).rejects.toThrow(/live trading is not enabled/i);
  });

  test("throws RobinhoodNotConfiguredError when credentials are missing, even with liveTradingEnabled", async () => {
    const client = new RobinhoodClient({ liveTradingEnabled: true });

    await expect(
      client.placeEquityOrder({ symbol: "SPY", side: "BUY", quantity: 1 }),
    ).rejects.toThrow(RobinhoodNotConfiguredError);
  });

  test("throws a clear not-implemented error once configured and enabled", async () => {
    const client = new RobinhoodClient({
      username: "user",
      password: "pass",
      liveTradingEnabled: true,
    });

    await expect(
      client.placeEquityOrder({ symbol: "SPY", side: "BUY", quantity: 1 }),
    ).rejects.toThrow(/not implemented/i);
  });
});
