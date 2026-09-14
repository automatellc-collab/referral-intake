/**
 * Live market data via Yahoo Finance's public chart endpoint. No API key,
 * no tracked quota (Twelve Data's free tier this replaced was 800
 * requests/day and got fully exhausted once — see project notes). Also
 * includes pre-market/after-hours candles, which Twelve Data's free tier
 * did not: real incident 2026-09-01, SPY gapped ~$6 overnight and the old
 * client reported yesterday's close as "current" with no way to tell.
 *
 * This is not an officially documented/supported API — it's the same
 * endpoint behind the widely-used `yfinance` Python library. It could
 * change shape or get rate-limited without notice; there is no SLA.
 */
import type { Candle } from "@/types/trading";

export interface Quote {
  symbol: string;
  price: number;
  timestamp: number;
}

const YAHOO_INTERVAL_MAP: Record<string, string> = {
  "1min": "1m",
  "5min": "5m",
  "15min": "15m",
  "30min": "30m",
  "1day": "1d",
};

const INTERVAL_MINUTES: Record<string, number> = {
  "1min": 1,
  "5min": 5,
  "15min": 15,
  "30min": 30,
};

function toYahooInterval(interval: string): string {
  return YAHOO_INTERVAL_MAP[interval] ?? interval;
}

// Yahoo enforces a hard ~60-calendar-day lookback cap on sub-daily
// intervals — requesting more throws a 422 rather than clamping silently.
const MAX_INTRADAY_RANGE_DAYS = 59;
const CANDLES_PER_TRADING_DAY_AT_5MIN = 78; // 6.5h regular session
const CALENDAR_TO_TRADING_DAY_RATIO = 7 / 5; // covers weekends
const CALENDAR_DAYS_HOLIDAY_BUFFER = 3;
const MIN_RANGE_DAYS = 5;

function rangeDaysForOutputsize(outputsize: number, intervalMinutes: number): string {
  const candlesPerDay = CANDLES_PER_TRADING_DAY_AT_5MIN * (5 / intervalMinutes);
  const tradingDaysNeeded = Math.ceil(outputsize / candlesPerDay);
  const calendarDays = Math.ceil(tradingDaysNeeded * CALENDAR_TO_TRADING_DAY_RATIO) + CALENDAR_DAYS_HOLIDAY_BUFFER;
  return `${Math.min(MAX_INTRADAY_RANGE_DAYS, Math.max(MIN_RANGE_DAYS, calendarDays))}d`;
}

// Daily bars aren't subject to the intraday 60-day cap — Yahoo accepts
// multi-year ranges directly. ~252 trading days/year; +1 year of buffer
// for holidays/weekends and so a "200-day SMA" request still has margin.
const TRADING_DAYS_PER_YEAR = 252;
const DAILY_RANGE_YEAR_BUFFER = 1;

function rangeYearsForDailyOutputsize(outputsize: number): string {
  const years = Math.ceil(outputsize / TRADING_DAYS_PER_YEAR) + DAILY_RANGE_YEAR_BUFFER;
  return `${years}y`;
}

interface YahooQuoteArray {
  open: (number | null)[];
  high: (number | null)[];
  low: (number | null)[];
  close: (number | null)[];
  volume: (number | null)[];
}

interface YahooChartResult {
  meta: { symbol: string };
  timestamp?: number[];
  indicators: { quote: YahooQuoteArray[] };
}

export interface YahooChartResponse {
  chart: {
    result?: YahooChartResult[];
    error?: { code: string; description: string } | null;
  };
}

export function parseYahooCandles(json: YahooChartResponse): Candle[] {
  if (json.chart.error) {
    throw new Error(`Yahoo Finance error: ${json.chart.error.description}`);
  }

  const result = json.chart.result?.[0];
  if (!result?.timestamp) {
    return [];
  }

  const quote = result.indicators.quote[0];
  const candles: Candle[] = [];

  for (let i = 0; i < result.timestamp.length; i++) {
    const open = quote.open[i];
    const high = quote.high[i];
    const low = quote.low[i];
    const close = quote.close[i];
    if (open == null || high == null || low == null || close == null) {
      continue; // forming or missing bar
    }
    candles.push({
      timestamp: result.timestamp[i] * 1000,
      open,
      high,
      low,
      close,
      volume: quote.volume[i] ?? 0,
    });
  }

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

export class YahooFinanceClient {
  private async fetchChart(symbol: string, interval: string, range: string): Promise<YahooChartResponse> {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
    url.searchParams.set("interval", interval);
    url.searchParams.set("range", range);
    url.searchParams.set("includePrePost", "true");

    const response = await fetch(url.toString(), { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) {
      throw new Error(`Yahoo Finance request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as YahooChartResponse;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const json = await this.fetchChart(symbol, "1m", "1d");
    const candles = parseYahooCandles(json);
    const last = candles[candles.length - 1];
    if (!last) {
      throw new Error(`Yahoo Finance returned no data for ${symbol}`);
    }
    return { symbol, price: last.close, timestamp: last.timestamp };
  }

  async getHistoricals(symbol: string, interval: string = "5min", outputsize: number = 100): Promise<Candle[]> {
    const range =
      interval === "1day"
        ? rangeYearsForDailyOutputsize(outputsize)
        : rangeDaysForOutputsize(outputsize, INTERVAL_MINUTES[interval] ?? 5);
    const json = await this.fetchChart(symbol, toYahooInterval(interval), range);
    return parseYahooCandles(json).slice(-outputsize);
  }
}

export function createMarketDataClientFromEnv(): YahooFinanceClient {
  return new YahooFinanceClient();
}
