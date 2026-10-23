import type { Booking } from "@/lib/types";

export default function BookingList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-neutral-500">No bookings yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {bookings.map((b) => (
        <div key={b.id} className="rounded-lg border border-neutral-200 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{b.caller_name || "Unnamed caller"}</span>
            <span className="text-xs text-neutral-500">
              {b.slot_start ? new Date(b.slot_start).toLocaleString() : "time pending"}
            </span>
          </div>
          <p className="mt-1 text-neutral-600">{b.job_description || "No details given"}</p>
          <p className="mt-1 text-xs text-neutral-400">{b.caller_phone}</p>
        </div>
      ))}
    </div>
  );
}
