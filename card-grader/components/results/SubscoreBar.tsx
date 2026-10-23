interface SubscoreBarProps {
  label: string;
  value: number;
  sourceLabel?: string;
}

export function SubscoreBar({ label, value, sourceLabel }: SubscoreBarProps) {
  const pct = (value / 10) * 100;
  const color = value >= 8 ? "bg-emerald-500" : value >= 6 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {value.toFixed(1)} / 10{sourceLabel ? ` · ${sourceLabel}` : ""}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
