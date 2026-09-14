"use client";

import { useEffect } from "react";
import type { EntrySignal } from "@/types/trading";

interface TradeSignalAlertProps {
  entry: EntrySignal;
}

export function TradeSignalAlert({ entry }: TradeSignalAlertProps) {
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    if (Notification.permission === "granted") {
      new Notification(`ORB ${entry.type} signal — ${entry.symbol}`, {
        body: `${entry.direction} entry at $${entry.price.toFixed(2)} · stop $${entry.stopLoss.toFixed(2)} · target $${entry.takeProfit.toFixed(2)}`,
      });
    }
    // Only fire once per newly detected signal (identified by detectedAt).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.detectedAt]);

  return (
    <div className="rounded-md border border-blue-300 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950">
      <div className="font-medium text-blue-900 dark:text-blue-200">
        {entry.type} entry signal — {entry.symbol} ({entry.direction})
      </div>
      <div className="mt-1 text-xs text-blue-800 dark:text-blue-300">
        Entry ${entry.price.toFixed(2)} · Stop ${entry.stopLoss.toFixed(2)} · Target $
        {entry.takeProfit.toFixed(2)} · R:R 1:{entry.riskRewardRatio}
      </div>
    </div>
  );
}
