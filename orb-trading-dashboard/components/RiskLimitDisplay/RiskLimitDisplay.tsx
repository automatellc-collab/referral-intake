"use client";

interface RiskLimitDisplayProps {
  currentLossPct: number;
  limitPct: number;
  allowed: boolean;
  reason: string | null;
}

export function RiskLimitDisplay({ currentLossPct, limitPct, allowed, reason }: RiskLimitDisplayProps) {
  const usagePct = Math.min(100, (currentLossPct / limitPct) * 100);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">Daily loss limit</span>
        <span className={allowed ? "text-emerald-600" : "text-red-600"}>
          {allowed ? "Trading allowed" : "Trading halted"}
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full ${allowed ? "bg-amber-500" : "bg-red-600"}`}
          style={{ width: `${usagePct}%` }}
        />
      </div>

      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
        Down {currentLossPct.toFixed(2)}% of {limitPct}% limit
      </div>

      {reason && <div className="mt-2 text-xs text-red-600">{reason}</div>}
    </div>
  );
}
