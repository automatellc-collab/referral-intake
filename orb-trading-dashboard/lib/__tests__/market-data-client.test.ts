import { afterEach, describe, expect, test, vi } from "vitest";
import { parseYahooCandles, YahooFinanceClient } from "@/lib/market-data-client";

function yahooChartResponse(overrides: {
  timestamps?: number[];
  open?: (number | null)[];
  high?: (number | null)[];
  low?: (number | null)[];
  close?: (number | null)[];
  volume?: (number | null)[];
  error?: { code: string; description: string } | null;
} = {}) {
  return {
    chart: {
      result: [
        {
          meta: { symbol: "SPY" },
          timestamp: overrides.timestamps ?? [1735300200, 1735300500],
          indicators: {
            quote: [
              {
                open: overrides.open ?? [450, 451],
                high: overrides.high ?? [451, 452],
                low: overrides.low ?? [449.5, 450.5],
                close: overrides.close ?? [450.75, 451.5],
                volume: overrides.volume ?? [1000, 500],
              },
            ],
          },
        },
      ],
      error: overrides.error ?? null,
    },
  };
}

describe("parseYahooCandles", () => {
  test("converts a chart response into ascending-chronological Candle[]", () => {
    const candles = parseYahooCandles(yahooChartResponse());

    expect(candles).toEqual([
      { timestamp: 1735300200000, open: 450, high: 451, low: 449.5, close: 450.75, volume: 1000 },
      { timestamp: 1735300500000, open: 451, high: 452, low: 450.5, close: 451.5, volume: 500 },
    ]);
  });

  test("skips bars with null OHLC values (forming/missing candles Yahoo sometimes returns)", () => {
    const candles = parseYahooCandles(
      yahooChartResponse({
        timestamps: [1735300200, 1735300500, 1735300800],
        open: [450, null, 452],
        high: [451, null, 453],
        low: [449.5, null, 451.5],
        close: [450.75, null, 452.5],
        volume: [1000, null, 800],
      }),
    );

    expect(candles).toHaveLength(2);
    expect(candles.map((c) => c.close)).toEqual([450.75, 452.5]);
  });

  test("returns an empty array when the result set is missing", () => {
    expect(parseYahooCandles({ chart: { result: undefined, error: null } })).toEqual([]);
  });

  test("throws when Yahoo returns an error payload", () => {
    expect(() =>
      parseYahooCandles(
        yahooChartResponse({ error: { code: "Not Found", description: "No data found for symbol" } }),
      ),
    ).toThrow(/no data found for symbol/i);
  });
});

describe("YahooFinanceClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("getQuote returns the latest candle as the current price, needing no API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        yahooChartResponse({
          timestamps: [1735300200, 1735300500],
          close: [450.75, 451.5],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new YahooFinanceClient();
    const quote = await client.getQuote("SPY");

    expect(quote).toEqual({ symbol: "SPY", price: 451.5, timestamp: 1735300500000 });
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("query1.finance.yahoo.com");
    expect(calledUrl).toContain("includePrePost=true");
    expect(calledUrl).not.toContain("apikey");
  });

  test("getQuote includes pre-market candles — the real gap this replaced Twelve Data for", async () => {
    // Real incident (2026-09-01): SPY gapped ~$6 overnight; Twelve Data's
    // free tier had zero pre-market visibility (is_market_open: false,
    // stuck on yesterday's close). Yahoo's chart endpoint with
    // includePrePost=true returns live pre-market bars instead.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        yahooChartResponse({
          timestamps: [1735282200], // a 9:10am-ish pre-market bar
          close: [761.84],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const quote = await new YahooFinanceClient().getQuote("SPY");
    expect(quote.price).toBe(761.84);
  });

  test("getHistoricals fetches 5-minute candles and truncates to the requested outputsize", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () =>
        yahooChartResponse({
          timestamps: [1735300200, 1735300500, 1735300800],
          open: [450, 451, 451.8],
          high: [451, 452, 452.5],
          low: [449.5, 450.5, 451.5],
          close: [450.75, 451.5, 452],
          volume: [1000, 500, 700],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const candles = await new YahooFinanceClient().getHistoricals("SPY", "5min", 2);

    expect(candles).toHaveLength(2);
    expect(candles.map((c) => c.close)).toEqual([451.5, 452]); // last 2, chronological
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("interval=5m");
  });

  test("getHistoricals uses a multi-year range (not the intraday day-count math) for daily bars", async () => {
    // A 200-day SMA needs ~200+ daily closes. Daily bars aren't subject to
    // Yahoo's 60-day intraday cap, but the intraday range-sizing formula
    // would badly undershoot if applied to a daily request.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => yahooChartResponse({ timestamps: [1735300200], close: [450.75] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await new YahooFinanceClient().getHistoricals("AAPL", "1day", 250);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain("interval=1d");
    expect(calledUrl).toMatch(/range=\d+y/);
  });

  test("surfaces a non-OK HTTP response as a thrown Error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new YahooFinanceClient().getQuote("SPY")).rejects.toThrow(/500/);
  });
});
