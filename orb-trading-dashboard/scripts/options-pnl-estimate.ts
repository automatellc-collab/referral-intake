/**
 * Estimates P&L for buying 1 SPY option contract (call on bullish signals,
 * put on bearish) per alert, held for up to 40 minutes, using the last
 * month's real trade log (entry/exit prices and times) from the backtest
 * engine, priced with Black-Scholes (0DTE, ATM strike).
 *
 * This is a THEORETICAL estimate, not a real-market backtest — no real
 * historical option quotes were used. Real premiums differ due to bid/ask
 * spread, actual realized IV vs the assumed IV here, and skew.
 *
 * Usage: npx tsx scripts/options-pnl-estimate.ts SPY
 */
import { readFileSync } from "fs";
import { join } from "path";
import { createMarketDataClientFromEnv } from "../lib/market-data-client";
import { runBacktest } from "../lib/backtest-engine";
import { blackScholesCall, blackScholesPut } from "../lib/options-pricing";
import type { TradingSettings } from "../types/trading";

function loadEnvLocal(): void {
  const envPath = join(__dirname, "..", ".env.local");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

loadEnvLocal();

const symbol = process.argv[2] ?? "SPY";
const RISK_FREE_RATE = 0.04;
const TRADING_MINUTES_PER_DAY = 390; // 9:30am-4:00pm ET
const TRADING_DAYS_PER_YEAR = 252;
const IV_SCENARIOS = [0.12, 0.15, 0.2, 0.25];

function minutesUntilCloseEt(timestampMs: number): number {
  const d = new Date(timestampMs);
  const etParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(etParts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(etParts.find((p) => p.type === "minute")?.value ?? "0");
  const minutesSinceMidnight = hour * 60 + minute;
  const closeMinutesSinceMidnight = 16 * 60; // 4:00 PM
  return Math.max(0, closeMinutesSinceMidnight - minutesSinceMidnight);
}

function timeToExpiryYears(timestampMs: number): number {
  const minsLeft = minutesUntilCloseEt(timestampMs);
  return minsLeft / TRADING_MINUTES_PER_DAY / TRADING_DAYS_PER_YEAR;
}

async function main() {
  const settingsRes = await fetch("http://localhost:3300/api/settings");
  const settingsJson = await settingsRes.json();
  const baseSettings: TradingSettings = settingsJson.data;

  const client = createMarketDataClientFromEnv();
  const candles = await client.getHistoricals(symbol, "5min", 1690); // ~1 month

  const settings = { ...baseSettings, entryTypeFilter: "FIBONACCI_ONLY" as const };
  const result = runBacktest({ symbol, candles, settings, startingEquity: 10000, maxHoldBars: 8 }); // 40 min

  console.log(`\n${symbol} — last month, FIBONACCI_ONLY entries, 40-min hold: ${result.totalTrades} signals\n`);

  for (const iv of IV_SCENARIOS) {
    let totalPnl = 0;
    const rows: string[] = [];

    for (const t of result.trades) {
      const strike = Math.round(t.entryPrice);
      const tEntry = timeToExpiryYears(t.entryAt);
      const tExit = timeToExpiryYears(t.exitAt);

      const pricer = t.direction === "BULLISH" ? blackScholesCall : blackScholesPut;
      const entryPremium = pricer(t.entryPrice, strike, tEntry, RISK_FREE_RATE, iv);
      const exitPremium = pricer(t.exitPrice, strike, Math.max(tExit, 0), RISK_FREE_RATE, iv);

      const contractPnl = (exitPremium - entryPremium) * 100; // 1 contract = 100 shares
      totalPnl += contractPnl;

      if (iv === IV_SCENARIOS[0]) {
        rows.push(
          `  ${t.date} ${t.direction.padEnd(8)} strike $${strike} entry $${entryPremium.toFixed(2)} -> exit $${exitPremium.toFixed(2)} pnl ${contractPnl >= 0 ? "+" : ""}$${contractPnl.toFixed(2)}`,
        );
      }
    }

    if (iv === IV_SCENARIOS[0]) {
      console.log("Per-trade detail (at IV=12% for illustration):");
      rows.forEach((r) => console.log(r));
      console.log();
    }

    console.log(`IV=${(iv * 100).toFixed(0)}%: total P&L across ${result.totalTrades} contracts = ${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`);
  }

  console.log(`\nFor comparison, trading the underlying shares (same signals, same 40-min hold): $${result.totalPnl.toFixed(2)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
