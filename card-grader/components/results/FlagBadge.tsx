import type { RegionFlag } from "@/lib/types";

const SEVERITY_STYLES: Record<RegionFlag["severity"], string> = {
  none: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  light: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  moderate: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  heavy: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
};

export function FlagBadge({ flag }: { flag: RegionFlag }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${SEVERITY_STYLES[flag.severity]}`}>
      {flag.region.replace("-", " ")}: {flag.severity}
    </span>
  );
}
