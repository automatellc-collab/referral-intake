"use client";

import { useEffect, useState } from "react";
import type { Candle, EntrySignal, ORBSignal, OpeningRange } from "@/types/trading";

interface DataHealth {
  isLive: boolean;
  staleSinceMinutes: number | null;
  openingRangeComplete: boolean;
}

interface SignalResponse {
  status: "DATA_UNAVAILABLE" | "NO_SIGNAL" | "SIGNAL";
  reason?: string;
  dataHealth: DataHealth;
  openingRange: OpeningRange | null;
  breakout: ORBSignal | null;
  entry: EntrySignal | null;
  quote?: { symbol: string; price: number; timestamp: number };
  candles: Candle[];
}

interface UseMarketDataResult {
  data: SignalResponse | null;
  error: string | null;
  isLoading: boolean;
}

// Yahoo Finance's chart endpoint has no published rate limit, but 60s
// keeps polling conservative and predictable.
const POLL_INTERVAL_MS = 60_000;

export function useMarketData(symbol: string | null, profile: string = "default"): UseMarketDataResult {
  const [data, setData] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/trading/signal?symbol=${encodeURIComponent(symbol as string)}&profile=${encodeURIComponent(profile)}`,
        );
        const json = await res.json();

        if (cancelled) return;

        if (!json.success) {
          setError(json.error ?? "Failed to load market data");
          setData(null);
        } else {
          setError(null);
          setData(json.data);
        }
      } catch {
        if (!cancelled) {
          setError("Network error fetching market data");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [symbol, profile]);

  return { data, error, isLoading };
}

export type { Candle };
