import type { CallLog } from "@/lib/types";

export default function CallLogList({ calls }: { calls: CallLog[] }) {
  if (calls.length === 0) {
    return <p className="text-sm text-neutral-500">No calls yet — once your number is live, they&apos;ll show up here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {calls.map((call) => (
        <div key={call.id} className="rounded-lg border border-neutral-200 p-3">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>{call.caller_number || "Unknown caller"}</span>
            <span className="flex items-center gap-2">
              {call.booked && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-800">Booked</span>
              )}
              {new Date(call.started_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line text-sm">{call.summary || "Summary pending…"}</p>
        </div>
      ))}
    </div>
  );
}
