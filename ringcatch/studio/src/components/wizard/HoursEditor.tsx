import type { Hours } from "@/lib/types";

const DAYS: { key: keyof Hours; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

interface Props {
  value: Hours;
  onChange: (hours: Hours) => void;
}

export default function HoursEditor({ value, onChange }: Props) {
  function setDay(day: keyof Hours, field: "open" | "close", val: string) {
    const current = value[day] || { open: "", close: "" };
    const updated = { ...current, [field]: val };
    onChange({ ...value, [day]: updated.open || updated.close ? updated : undefined });
  }

  function toggleClosed(day: keyof Hours, closed: boolean) {
    const next = { ...value };
    if (closed) delete next[day];
    else next[day] = { open: "9:00am", close: "5:00pm" };
    onChange(next);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Hours</h2>
      <div className="mt-3 flex flex-col gap-2">
        {DAYS.map(({ key, label }) => {
          const day = value[key];
          const closed = !day;
          return (
            <div key={key} className="flex items-center gap-3 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input
                  type="checkbox"
                  checked={!closed}
                  onChange={(e) => toggleClosed(key, !e.target.checked)}
                />
                {label}
              </label>
              {!closed && (
                <>
                  <input
                    value={day?.open || ""}
                    onChange={(e) => setDay(key, "open", e.target.value)}
                    placeholder="9:00am"
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1"
                  />
                  <span className="text-neutral-400">to</span>
                  <input
                    value={day?.close || ""}
                    onChange={(e) => setDay(key, "close", e.target.value)}
                    placeholder="5:00pm"
                    className="w-24 rounded-md border border-neutral-300 px-2 py-1"
                  />
                </>
              )}
              {closed && <span className="text-neutral-400">Closed</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
