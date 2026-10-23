/**
 * A/B backtest for the "switch to 10-minute candles after 11am ET" change
 * (lib/orb-strategy.ts's applyElevenAmTimeframeSwitch, added 2026-09-17).
 *
 * For each locked symbol and each live profile, runs the SAME year of
 * 5-minute candles through two variants of getEntrySignal:
 *   - LEGACY: the pre-change logic — always 5-minute candles, no switch.
 *   - CURRENT: today's lib/orb-strategy.ts, which merges into 10-minute
 *     bars after 11am ET.
 * Breakout detection, position sizing, and exit simulation are identical
 * (imported straight from lib/) in both runs — the only variable is the
 * entry-signal timeframe, isolating exactly what changed.
 *
 * Usage: npx tsx scripts/backtest-eleven-am-switch.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { runBacktest } from "../lib/backtest-engine";
import type { BacktestResult } from "../lib/backtest-engine";
import { buildOpeningRange, detectBreakout } from "../lib/orb-strategy";
import { getEasternDateString } from "../lib/market-hours";
import { calculatePositionSize } from "../lib/risk-calculator";
import { calculateFibonacciLevels, isPriceInFibonacciZone } from "../lib/fibonacci";
import { SettingsRepository } from "../lib/repositories/settings-repository";
import type {
  Candle,
  EntrySignal,
  EntryType,
  ORBDirection,
  ORBSignal,
  TradingSettings,
} from "../types/trading";

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

const SYMBOLS = ["SPY", "QQQ", "TSLA", "CRWD", "NVDA", "AMD", "PLTR", "COIN", "MSTR", "META", "AVGO"];
const PROFILES = ["default", "video-literal"];
const TARGET_DAYS = 365;
const API_KEY = process.env.TWELVE_DATA_API_KEY;

// ---------------------------------------------------------------------------
// Rate-limited fetch (module-level spacing so it holds across symbols, not
// just within one) — same pattern as scripts/sma-rejection-backtest.ts.
// ---------------------------------------------------------------------------
interface RawValue {
  datetime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function toCandle(v: RawValue): Candle {
  return {
    timestamp: Date.parse(`${v.datetime.replace(" ", "T")}Z`),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseInt(v.volume, 10),
  };
}

const MIN_REQUEST_SPACING_MS = 8500;
let lastRequestAt = 0;

async function waitForRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_SPACING_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_SPACING_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

async function fetchChunk(symbol: string, endDate: string | null): Promise<RawValue[]> {
  await waitForRateLimit();

  const url = new URL("https://api.twelvedata.com/time_series");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "5min");
  url.searchParams.set("outputsize", "5000");
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("apikey", API_KEY as string);
  if (endDate) url.searchParams.set("end_date", endDate);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.status === "error") {
    throw new Error(`Twelve Data error for ${symbol}: ${json.message}`);
  }
  return json.values ?? [];
}

async function fetchFullYear(symbol: string): Promise<Candle[]> {
  const allValues: RawValue[] = [];
  let endDate: string | null = null;
  const cutoff = Date.now() - TARGET_DAYS * 24 * 60 * 60 * 1000;

  for (let i = 0; i < 8; i++) {
    const chunk = await fetchChunk(symbol, endDate);
    if (chunk.length === 0) break;
    allValues.push(...chunk);

    const oldest = chunk[chunk.length - 1].datetime;
    const oldestMs = Date.parse(`${oldest.replace(" ", "T")}Z`);
    if (oldestMs <= cutoff) break;

    const prevDay = new Date(oldestMs - 24 * 60 * 60 * 1000);
    endDate = prevDay.toISOString().slice(0, 10);
  }

  const seen = new Set<number>();
  const candles: Candle[] = [];
  for (const v of allValues) {
    const c = toCandle(v);
    if (c.timestamp >= cutoff && !seen.has(c.timestamp)) {
      seen.add(c.timestamp);
      candles.push(c);
    }
  }
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

// ---------------------------------------------------------------------------
// LEGACY entry-signal logic: an exact copy of getEntrySignal as it existed
// in lib/orb-strategy.ts BEFORE the 2026-09-17 "switch to 10-minute candles
// after 11am ET" change (commit 4a7a94d). No aggregation — always 5-minute.
// ---------------------------------------------------------------------------
function isRejectionCandleLegacy(
  candle: Candle,
  direction: ORBDirection,
  openingRange: NonNullable<ReturnType<typeof buildOpeningRange>>,
): boolean {
  if (direction === "BULLISH") {
    return candle.low <= openingRange.high && candle.close > openingRange.high;
  }
  return candle.high >= openingRange.low && candle.close < openingRange.low;
}

function buildEntryLegacy(
  type: EntryType,
  signal: ORBSignal,
  price: number,
  detectedAt: number,
  settings: TradingSettings,
): EntrySignal {
  const direction = signal.direction;
  const stopLoss = direction === "BULLISH" ? signal.openingRange.low : signal.openingRange.high;
  const riskPerShare = Math.abs(price - stopLoss);
  const takeProfit =
    direction === "BULLISH"
      ? price + riskPerShare * settings.riskRewardRatio
      : price - riskPerShare * settings.riskRewardRatio;

  return {
    type,
    symbol: signal.symbol,
    direction,
    price,
    stopLoss,
    takeProfit,
    riskRewardRatio: settings.riskRewardRatio,
    detectedAt,
  };
}

function getFibonacciAnchorsLegacy(
  signal: ORBSignal,
  candlesSinceBreakout: Candle[],
  mode: TradingSettings["fibonacciAnchorMode"],
): { low: number; high: number } {
  const { openingRange, direction } = signal;

  if (mode === "BREAKOUT_LEG") {
    if (direction === "BULLISH") {
      const swingHigh = Math.max(...candlesSinceBreakout.map((c) => c.high));
      return { low: openingRange.high, high: swingHigh };
    }
    const swingLow = Math.min(...candlesSinceBreakout.map((c) => c.low));
    return { low: swingLow, high: openingRange.low };
  }

  return { low: openingRange.low, high: openingRange.high };
}

function legacyGetEntrySignal(
  signal: ORBSignal,
  candlesSinceBreakout: Candle[],
  settings: TradingSettings,
): EntrySignal | null {
  const { openingRange, direction } = signal;

  const postBreakoutCandles = candlesSinceBreakout.filter((c) => c.timestamp > signal.breakoutAt);
  if (postBreakoutCandles.length === 0) return null;

  const lastCandle = postBreakoutCandles[postBreakoutCandles.length - 1];
  const allowRetest = settings.entryTypeFilter !== "FIBONACCI_ONLY";
  const allowFibonacci = settings.entryTypeFilter !== "RETEST_ONLY";

  if (allowRetest) {
    const rejectionCandle = postBreakoutCandles.find((c) =>
      isRejectionCandleLegacy(c, direction, openingRange),
    );
    if (rejectionCandle) {
      return buildEntryLegacy("RETEST", signal, rejectionCandle.close, rejectionCandle.timestamp, settings);
    }
  }

  if (!allowFibonacci) return null;

  const anchors = getFibonacciAnchorsLegacy(signal, candlesSinceBreakout, settings.fibonacciAnchorMode);
  if (anchors.low >= anchors.high) return null;

  const fibLevels = calculateFibonacciLevels(anchors.low, anchors.high, direction);
  if (isPriceInFibonacciZone(lastCandle.close, fibLevels, direction)) {
    return buildEntryLegacy("FIBONACCI", signal, lastCandle.close, lastCandle.timestamp, settings);
  }

  return null;
}

// ---------------------------------------------------------------------------
// LEGACY backtest loop: a copy of lib/backtest-engine.ts's runBacktest, with
// legacyGetEntrySignal swapped in for getEntrySignal. Everything else
// (grouping, breakout detection, position sizing, exit simulation) is
// identical to the CURRENT run, imported straight from lib/.
// ---------------------------------------------------------------------------
function groupByEasternDate(candles: Candle[]): Map<string, Candle[]> {
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  const groups = new Map<string, Candle[]>();
  for (const candle of sorted) {
    const date = getEasternDateString(candle.timestamp);
    const existing = groups.get(date) ?? [];
    existing.push(candle);
    groups.set(date, existing);
  }
  return groups;
}

function findFirstBreakoutLegacy(
  postRangeCandles: Candle[],
  openingRange: NonNullable<ReturnType<typeof buildOpeningRange>>,
): { signal: ORBSignal; breakoutIndex: number } | null {
  for (let i = 0; i < postRangeCandles.length; i++) {
    const candle = postRangeCandles[i];
    const signal = detectBreakout(openingRange, candle.close, candle.timestamp);
    if (signal) return { signal, breakoutIndex: i };
  }
  return null;
}

function findFirstEntryLegacy(
  postRangeCandles: Candle[],
  breakoutIndex: number,
  signal: ORBSignal,
  settings: TradingSettings,
): { entry: EntrySignal; entryIndex: number } | null {
  const candlesSinceBreakout: Candle[] = [];
  for (let i = breakoutIndex; i < postRangeCandles.length; i++) {
    candlesSinceBreakout.push(postRangeCandles[i]);
    const entry = legacyGetEntrySignal(signal, candlesSinceBreakout, settings);
    if (entry) return { entry, entryIndex: i };
  }
  return null;
}

function simulateExitLegacy(
  direction: ORBDirection,
  stopLoss: number,
  takeProfit: number,
  remainingCandles: Candle[],
): { price: number; timestamp: number } {
  for (const candle of remainingCandles) {
    if (direction === "BULLISH") {
      if (candle.low <= stopLoss) return { price: stopLoss, timestamp: candle.timestamp };
      if (candle.high >= takeProfit) return { price: takeProfit, timestamp: candle.timestamp };
    } else {
      if (candle.high >= stopLoss) return { price: stopLoss, timestamp: candle.timestamp };
      if (candle.low <= takeProfit) return { price: takeProfit, timestamp: candle.timestamp };
    }
  }
  const lastCandle = remainingCandles[remainingCandles.length - 1];
  return { price: lastCandle.close, timestamp: lastCandle.timestamp };
}

function legacyRunBacktest(input: {
  symbol: string;
  candles: Candle[];
  settings: TradingSettings;
  startingEquity: number;
}): BacktestResult {
  const { symbol, candles, settings, startingEquity } = input;
  const dayGroups = groupByEasternDate(candles);

  const trades: BacktestResult["trades"] = [];
  let runningEquity = startingEquity;
  let peakEquity = startingEquity;
  let maxDrawdownPct = 0;

  for (const [date, dayCandles] of dayGroups) {
    const openingRange = buildOpeningRange(symbol, date, dayCandles);
    if (!openingRange) continue;

    const postRangeCandles = dayCandles
      .filter((c) => c.timestamp > openingRange.formedAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (postRangeCandles.length === 0) continue;

    const breakout = findFirstBreakoutLegacy(postRangeCandles, openingRange);
    if (!breakout) continue;

    const found = findFirstEntryLegacy(postRangeCandles, breakout.breakoutIndex, breakout.signal, settings);
    if (!found) continue;

    const { entry, entryIndex } = found;
    const remainingCandles = postRangeCandles.slice(entryIndex + 1);
    if (remainingCandles.length === 0) continue;

    const positionSize = calculatePositionSize({
      accountEquity: runningEquity,
      entryPrice: entry.price,
      stopLoss: entry.stopLoss,
      settings,
    });
    if (positionSize.quantity <= 0) continue;

    const exit = simulateExitLegacy(entry.direction, entry.stopLoss, entry.takeProfit, remainingCandles);
    const pnl =
      entry.direction === "BULLISH"
        ? (exit.price - entry.price) * positionSize.quantity
        : (entry.price - exit.price) * positionSize.quantity;

    runningEquity += pnl;
    peakEquity = Math.max(peakEquity, runningEquity);
    const drawdownPct = peakEquity === 0 ? 0 : ((peakEquity - runningEquity) / peakEquity) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);

    trades.push({
      date,
      direction: entry.direction,
      entryType: entry.type,
      entryPrice: entry.price,
      exitPrice: exit.price,
      quantity: positionSize.quantity,
      pnl,
      exitReason: exit.price === entry.stopLoss ? "STOP_LOSS" : exit.price === entry.takeProfit ? "TAKE_PROFIT" : "END_OF_DAY",
      entryAt: entry.detectedAt,
      exitAt: exit.timestamp,
    });
  }

  const wins = trades.filter((t) => t.pnl > 0).length;
  const losses = trades.filter((t) => t.pnl <= 0).length;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);

  return {
    symbol,
    totalTrades: trades.length,
    wins,
    losses,
    winRate: trades.length === 0 ? 0 : (wins / trades.length) * 100,
    totalPnl,
    avgProfitPerTrade: trades.length === 0 ? 0 : totalPnl / trades.length,
    maxDrawdownPct,
    endingEquity: runningEquity,
    trades,
  };
}

// ---------------------------------------------------------------------------
// Main: fetch once per symbol, run both variants per profile, report.
// ---------------------------------------------------------------------------
interface ComparisonRow {
  symbol: string;
  profile: string;
  legacy: BacktestResult;
  current: BacktestResult;
}

function fmtRow(label: string, r: BacktestResult): string {
  return [
    label.padEnd(9),
    String(r.totalTrades).padEnd(7),
    (r.winRate.toFixed(1) + "%").padEnd(8),
    ("$" + r.totalPnl.toFixed(2)).padEnd(11),
    ("$" + r.avgProfitPerTrade.toFixed(2)).padEnd(9),
    r.maxDrawdownPct.toFixed(1) + "%",
  ].join(" ");
}

async function main() {
  if (!API_KEY) {
    throw new Error("TWELVE_DATA_API_KEY not set in .env.local");
  }

  const rows: ComparisonRow[] = [];

  for (const symbol of SYMBOLS) {
    console.log(`\nFetching ~${TARGET_DAYS} days of ${symbol} 5-min candles...`);
    const candles = await fetchFullYear(symbol);
    if (candles.length === 0) {
      console.log(`  No data returned for ${symbol}, skipping.`);
      continue;
    }
    const spanDays = (candles[candles.length - 1].timestamp - candles[0].timestamp) / (24 * 60 * 60 * 1000);
    console.log(`  ${candles.length} candles spanning ${spanDays.toFixed(0)} days`);

    for (const profile of PROFILES) {
      const settings = new SettingsRepository().get(profile);
      const legacy = legacyRunBacktest({ symbol, candles, settings, startingEquity: 10000 });
      const current = runBacktest({ symbol, candles, settings, startingEquity: 10000 });
      rows.push({ symbol, profile, legacy, current });

      console.log(`\n  [${profile}] entryTypeFilter=${settings.entryTypeFilter}`);
      console.log("  " + fmtRow("LEGACY", legacy));
      console.log("  " + fmtRow("CURRENT", current));
    }
  }

  // Aggregate totals per profile across all symbols.
  console.log("\n\n=== AGGREGATE (all symbols combined) ===");
  const lines: string[] = [
    "# 11am 10-minute candle switch — 1-year A/B backtest",
    "",
    `Generated ${new Date().toISOString()}`,
    "",
    "LEGACY = pre-change behavior (always 5-min candles). CURRENT = post-change (10-min candles after 11am ET).",
    "",
  ];

  for (const profile of PROFILES) {
    const profileRows = rows.filter((r) => r.profile === profile);
    const legacyTrades = profileRows.reduce((sum, r) => sum + r.legacy.totalTrades, 0);
    const legacyWins = profileRows.reduce((sum, r) => sum + r.legacy.wins, 0);
    const legacyPnl = profileRows.reduce((sum, r) => sum + r.legacy.totalPnl, 0);
    const currentTrades = profileRows.reduce((sum, r) => sum + r.current.totalTrades, 0);
    const currentWins = profileRows.reduce((sum, r) => sum + r.current.wins, 0);
    const currentPnl = profileRows.reduce((sum, r) => sum + r.current.totalPnl, 0);

    const legacyWinRate = legacyTrades === 0 ? 0 : (legacyWins / legacyTrades) * 100;
    const currentWinRate = currentTrades === 0 ? 0 : (currentWins / currentTrades) * 100;

    console.log(`\n[${profile}]`);
    console.log(`  LEGACY:  ${legacyTrades} trades, ${legacyWinRate.toFixed(1)}% win rate, $${legacyPnl.toFixed(2)} total P&L`);
    console.log(`  CURRENT: ${currentTrades} trades, ${currentWinRate.toFixed(1)}% win rate, $${currentPnl.toFixed(2)} total P&L`);
    console.log(`  Delta:   ${currentTrades - legacyTrades} trades, ${(currentWinRate - legacyWinRate).toFixed(1)}pp win rate, $${(currentPnl - legacyPnl).toFixed(2)} P&L`);

    lines.push(`## Profile: ${profile}`, "");
    lines.push("| Variant | Trades | Win rate | Total P&L |", "|---|---|---|---|");
    lines.push(`| LEGACY (5-min always) | ${legacyTrades} | ${legacyWinRate.toFixed(1)}% | $${legacyPnl.toFixed(2)} |`);
    lines.push(`| CURRENT (10-min after 11am) | ${currentTrades} | ${currentWinRate.toFixed(1)}% | $${currentPnl.toFixed(2)} |`);
    lines.push(`| **Delta** | ${currentTrades - legacyTrades} | ${(currentWinRate - legacyWinRate).toFixed(1)}pp | $${(currentPnl - legacyPnl).toFixed(2)} |`);
    lines.push("", "### Per symbol", "");
    lines.push("| Symbol | Legacy trades | Legacy win% | Legacy P&L | Current trades | Current win% | Current P&L |", "|---|---|---|---|---|---|---|");
    for (const r of profileRows) {
      lines.push(
        `| ${r.symbol} | ${r.legacy.totalTrades} | ${r.legacy.winRate.toFixed(1)}% | $${r.legacy.totalPnl.toFixed(2)} | ` +
          `${r.current.totalTrades} | ${r.current.winRate.toFixed(1)}% | $${r.current.totalPnl.toFixed(2)} |`,
      );
    }
    lines.push("");
  }

  const outDir = join(__dirname, "..", "data", "backtests");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `eleven-am-switch-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(outPath, lines.join("\n"));
  console.log(`\nReport written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
