/**
 * Robinhood has no official public trading API for retail accounts. Live
 * order placement would require talking to the same unofficial,
 * reverse-engineered endpoints (and login flow) that libraries like
 * robin_stocks use — against Robinhood's Terms of Service, with real
 * account-suspension risk. That path is deliberately NOT implemented here;
 * `placeEquityOrder` always throws. Live market data comes from a
 * legitimate provider instead — see lib/market-data-client.ts.
 *
 * Safety gate (do not remove): `placeEquityOrder` requires
 * `liveTradingEnabled: true` (env: ROBINHOOD_LIVE_TRADING_ENABLED=true)
 * even once/if the order-placement path is ever implemented — configuring
 * credentials alone must never be enough to place real orders.
 */
import type { TradeSide } from "@/types/trading";

export class RobinhoodNotConfiguredError extends Error {
  constructor() {
    super(
      "Robinhood client is not configured. Set ROBINHOOD_USERNAME and ROBINHOOD_PASSWORD.",
    );
    this.name = "RobinhoodNotConfiguredError";
  }
}

export interface RobinhoodConfig {
  username?: string;
  password?: string;
  liveTradingEnabled?: boolean;
}

interface EquityOrderInput {
  symbol: string;
  side: TradeSide;
  quantity: number;
}

interface OrderPayloadInput {
  accountUrl: string;
  instrumentUrl: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
}

export function buildEquityOrderPayload(input: OrderPayloadInput) {
  return {
    account: input.accountUrl,
    instrument: input.instrumentUrl,
    symbol: input.symbol,
    side: input.side.toLowerCase(),
    quantity: String(input.quantity),
    type: "market",
    time_in_force: "gfd",
    trigger: "immediate",
  };
}

export class RobinhoodClient {
  constructor(private readonly config: RobinhoodConfig) {}

  private isConfigured(): boolean {
    return Boolean(this.config.username && this.config.password);
  }

  async placeEquityOrder(order: EquityOrderInput): Promise<unknown> {
    if (!this.config.liveTradingEnabled) {
      throw new Error(
        "Live trading is not enabled. Set ROBINHOOD_LIVE_TRADING_ENABLED=true to allow real order placement.",
      );
    }

    if (!this.isConfigured()) {
      throw new RobinhoodNotConfiguredError();
    }

    // Not implemented by design — see module doc comment above. This app
    // does not log into Robinhood at all; AUTOMATED mode will always be
    // BLOCKED until this is implemented and reviewed on its own.
    throw new Error(
      "Live order placement is not implemented. This app intentionally does not integrate with Robinhood's " +
        "unofficial login/order API. Use PAPER or ALERTS mode.",
    );
  }
}

export function createRobinhoodClientFromEnv(): RobinhoodClient {
  return new RobinhoodClient({
    username: process.env.ROBINHOOD_USERNAME,
    password: process.env.ROBINHOOD_PASSWORD,
    liveTradingEnabled: process.env.ROBINHOOD_LIVE_TRADING_ENABLED === "true",
  });
}
