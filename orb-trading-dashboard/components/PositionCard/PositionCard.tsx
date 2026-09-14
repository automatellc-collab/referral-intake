"use client";

import type { Trade } from "@/types/trading";

interface PositionCardProps {
  trade: Trade;
  currentPrice?: number;
  onClose?: (tradeId: string, exitPrice: number) => void;
  isClosing?: boolean;
}

export function PositionCard({ trade, currentPrice, onClose, isClosing }: PositionCardProps) {
  const unrealizedPnl =
    currentPrice !== undefined
      ? trade.side === "BUY"
        ? (currentPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - currentPrice) * trade.quantity
      : null;

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {trade.symbol} · {trade.side}
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {trade.mode}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <div>Entry: ${trade.entryPrice.toFixed(2)}</div>
        <div>Qty: {trade.quantity}</div>
        <div>Stop: ${trade.stopLoss.toFixed(2)}</div>
        <div>Target: ${trade.takeProfit.toFixed(2)}</div>
      </div>

      {unrealizedPnl !== null && (
        <div
          className={`mt-3 text-sm font-medium ${
            unrealizedPnl >= 0 ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {unrealizedPnl >= 0 ? "+" : ""}
          ${unrealizedPnl.toFixed(2)} unrealized
        </div>
      )}

      {onClose && currentPrice !== undefined && (
        <button
          type="button"
          disabled={isClosing}
          onClick={() => onClose(trade.id, currentPrice)}
          className="mt-3 w-full rounded-md border border-zinc-300 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {isClosing ? "Closing…" : "Close position"}
        </button>
      )}
    </div>
  );
}
