const ET_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const ET_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getEasternDateString(timestampMs: number): string {
  return ET_DATE_FORMATTER.format(new Date(timestampMs));
}

/** Parses a "YYYY-MM-DD HH:MM:SS" string (no timezone marker, e.g. from
 * Twelve Data or SQLite's datetime('now')) as UTC, returning epoch ms. */
export function parseUtcSpaceDatetime(datetime: string): number {
  return Date.parse(`${datetime.replace(" ", "T")}Z`);
}

const MARKET_OPEN_MINUTES = 9 * 60 + 30; // 9:30 AM ET
const OPENING_RANGE_CLOSE_MINUTES = 9 * 60 + 45; // 9:45 AM ET (15-min OR, default)
const ELEVEN_AM_MINUTES = 11 * 60; // 11:00 AM ET
const MARKET_CLOSE_MINUTES = 16 * 60; // 4:00 PM ET

// QQQ backtested better with a 30-min opening range (9:30-10:00 ET) than the
// standard 15-min window (2026-09-27: 55.0% WR / +$658.89 vs 49.5% WR /
// -$268.27 over a full year, FIBONACCI_ONLY). Every other symbol keeps 15-min.
const WIDE_OPENING_RANGE_SYMBOLS = new Set(["QQQ"]);
const OPENING_RANGE_CLOSE_MINUTES_WIDE = 10 * 60; // 10:00 AM ET (30-min OR)

function getOpeningRangeCloseMinutes(symbol?: string): number {
  return symbol && WIDE_OPENING_RANGE_SYMBOLS.has(symbol)
    ? OPENING_RANGE_CLOSE_MINUTES_WIDE
    : OPENING_RANGE_CLOSE_MINUTES;
}

export function getEasternMinutesOfDay(timestampMs: number): number {
  const parts = ET_TIME_FORMATTER.formatToParts(new Date(timestampMs));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  // Intl formats midnight as "24:00" with hour12: false in some environments; normalize.
  return (hour % 24) * 60 + minute;
}

export function isWithinOpeningRangeWindow(timestampMs: number, symbol?: string): boolean {
  const minutes = getEasternMinutesOfDay(timestampMs);
  return minutes >= MARKET_OPEN_MINUTES && minutes < getOpeningRangeCloseMinutes(symbol);
}

export function isMarketOpen(timestampMs: number): boolean {
  const minutes = getEasternMinutesOfDay(timestampMs);
  return minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES;
}

export function hasOpeningRangeClosed(timestampMs: number, symbol?: string): boolean {
  return getEasternMinutesOfDay(timestampMs) >= getOpeningRangeCloseMinutes(symbol);
}

export function isAfterElevenAm(timestampMs: number): boolean {
  return getEasternMinutesOfDay(timestampMs) >= ELEVEN_AM_MINUTES;
}
