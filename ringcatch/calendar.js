/**
 * RingCatch — booking module (Slice 3)
 * ------------------------------------
 * Three jobs: offer real appointment WINDOWS, book one, and text a scheduling
 * link. Trades book arrival windows ("this afternoon, 1 to 3"), not exact minutes.
 *
 * Backends:
 *   - Dev/default: a MOCK calendar (no accounts, no keys) so the flow is testable.
 *   - Real: set GOOGLE_CALENDAR_ID + GOOGLE_ACCESS_TOKEN to write to Google Calendar
 *     via REST (no heavy googleapis dependency).
 */

const {
  BUSINESS_TZ = "America/New_York",
  BOOKING_LINK, // e.g. a Calendly/Cal.com link — used for text-a-link
  GOOGLE_CALENDAR_ID, // "primary" or a calendar id
  GOOGLE_ACCESS_TOKEN, // a valid OAuth / service-account access token
} = process.env;

// Arrival windows the business offers, in local hours.
const WINDOWS = [
  { from: 8, to: 10, label: "morning, 8 to 10" },
  { from: 10, to: 12, label: "late morning, 10 to noon" },
  { from: 13, to: 15, label: "afternoon, 1 to 3" },
  { from: 15, to: 17, label: "late afternoon, 3 to 5" },
];

function dayLabel(day, startOfToday) {
  const diff = Math.round((day - startOfToday) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return day.toLocaleDateString("en-US", { weekday: "long" });
}

/**
 * The next `count` open windows from `now`, skipping past windows and Sundays.
 * Returns [{ id, label, startISO, endISO }].
 */
function getAvailableSlots(now = new Date(), count = 3) {
  const slots = [];
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  for (let dayOffset = 0; slots.length < count && dayOffset < 7; dayOffset++) {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() + dayOffset);
    if (day.getDay() === 0) continue; // closed Sundays

    for (const w of WINDOWS) {
      if (slots.length >= count) break;
      const start = new Date(day);
      start.setHours(w.from, 0, 0, 0);
      const end = new Date(day);
      end.setHours(w.to, 0, 0, 0);
      if (start <= now) continue; // window already started
      slots.push({
        id: slots.length + 1,
        label: `${dayLabel(day, startOfToday)} ${w.label}`,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
      });
    }
  }
  return slots;
}

/** Create the appointment. details: { name, phone, job, address }. */
async function bookSlot(slot, details) {
  if (GOOGLE_CALENDAR_ID && GOOGLE_ACCESS_TOKEN) {
    try {
      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          GOOGLE_CALENDAR_ID
        )}/events`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${GOOGLE_ACCESS_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            summary: `${details.job || "Service call"} — ${details.name || "Caller"}`,
            description:
              `Booked by RingCatch.\n` +
              `Name: ${details.name || "-"}\nPhone: ${details.phone || "-"}\n` +
              `Job: ${details.job || "-"}\nAddress: ${details.address || "-"}`,
            start: { dateTime: slot.startISO, timeZone: BUSINESS_TZ },
            end: { dateTime: slot.endISO, timeZone: BUSINESS_TZ },
          }),
        }
      );
      const data = await resp.json();
      if (data.id) return { ok: true, eventId: data.id };
      return { ok: false, error: data.error?.message || "calendar error" };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // Mock backend — no account needed. Proves the flow end to end.
  console.log(`[calendar:mock] booked "${slot.label}" for ${details.name || "caller"} (${details.job || "job"})`);
  return { ok: true, eventId: `mock-${Date.now()}`, mock: true };
}

/** Text the caller a self-serve scheduling link (Rosie's "text custom links"). */
async function textLink(client, to, from, businessName) {
  if (!BOOKING_LINK) return { ok: false, error: "no BOOKING_LINK set" };
  if (!client) return { ok: false, error: "no SMS client" };
  try {
    await client.messages.create({
      to,
      from,
      body: `${businessName}: tap here to pick your appointment time — ${BOOKING_LINK}`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { getAvailableSlots, bookSlot, textLink, WINDOWS };
