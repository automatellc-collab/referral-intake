"use client";

import { useCallback, useState } from "react";
import type { Trade } from "@/types/trading";

interface ExecuteResult {
  status: "EXECUTED" | "ALERTED" | "BLOCKED" | "NO_SIGNAL";
  trade?: Trade;
  reason?: string;
}

interface UseTradeExecutionResult {
  execute: (symbol: string, accountEquity: number, profile?: string) => Promise<ExecuteResult | null>;
  closePosition: (tradeId: string, exitPrice: number, profile?: string) => Promise<Trade | null>;
  isSubmitting: boolean;
  lastError: string | null;
}

export function useTradeExecution(): UseTradeExecutionResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const execute = useCallback(async (symbol: string, accountEquity: number, profile: string = "default") => {
    setIsSubmitting(true);
    setLastError(null);
    try {
      const res = await fetch("/api/trading/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, accountEquity, profile }),
      });
      const json = await res.json();
      if (!json.success) {
        setLastError(json.error ?? "Execution failed");
        return null;
      }
      return json.data as ExecuteResult;
    } catch {
      setLastError("Network error while executing trade");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const closePosition = useCallback(async (tradeId: string, exitPrice: number, profile: string = "default") => {
    setIsSubmitting(true);
    setLastError(null);
    try {
      const res = await fetch("/api/trading/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId, exitPrice, profile }),
      });
      const json = await res.json();
      if (!json.success) {
        setLastError(json.error ?? "Close failed");
        return null;
      }
      return json.data as Trade;
    } catch {
      setLastError("Network error while closing position");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  return { execute, closePosition, isSubmitting, lastError };
}
