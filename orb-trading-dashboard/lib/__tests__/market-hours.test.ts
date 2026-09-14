import { describe, expect, test } from "vitest";
import {
  getEasternDateString,
  getEasternMinutesOfDay,
  isWithinOpeningRangeWindow,
  isMarketOpen,
  parseUtcSpaceDatetime,
} from "@/lib/market-hours";

// 2026-08-26 is a Wednesday (regular trading day)
function etTimestamp(hour: number, minute: number): number {
  // Build a UTC timestamp that corresponds to the given ET wall-clock time.
  // EDT (summer) is UTC-4.
  return Date.UTC(2026, 7, 26, hour + 4, minute, 0);
}

describe("getEasternMinutesOfDay", () => {
  test("converts 9:30 AM ET to 570 minutes since midnight", () => {
    expect(getEasternMinutesOfDay(etTimestamp(9, 30))).toBe(570);
  });

  test("converts 9:45 AM ET to 585 minutes since midnight", () => {
    expect(getEasternMinutesOfDay(etTimestamp(9, 45))).toBe(585);
  });
});

describe("isWithinOpeningRangeWindow", () => {
  test("returns true for a candle at 9:30 AM ET", () => {
    expect(isWithinOpeningRangeWindow(etTimestamp(9, 30))).toBe(true);
  });

  test("returns true for a candle at 9:44 AM ET", () => {
    expect(isWithinOpeningRangeWindow(etTimestamp(9, 44))).toBe(true);
  });

  test("returns false for a candle at 9:45 AM ET (range has closed)", () => {
    expect(isWithinOpeningRangeWindow(etTimestamp(9, 45))).toBe(false);
  });

  test("returns false for a candle before market open", () => {
    expect(isWithinOpeningRangeWindow(etTimestamp(9, 15))).toBe(false);
  });
});

describe("isMarketOpen", () => {
  test("returns true during regular trading hours", () => {
    expect(isMarketOpen(etTimestamp(10, 0))).toBe(true);
  });

  test("returns false before market open", () => {
    expect(isMarketOpen(etTimestamp(9, 0))).toBe(false);
  });

  test("returns false after market close", () => {
    expect(isMarketOpen(etTimestamp(16, 30))).toBe(false);
  });
});

describe("getEasternDateString", () => {
  test("formats a timestamp as an ET calendar date", () => {
    expect(getEasternDateString(etTimestamp(9, 30))).toBe("2026-08-26");
  });

  test("distinguishes two candles that fall on different ET calendar days", () => {
    const day1 = getEasternDateString(etTimestamp(9, 30));
    const day2 = getEasternDateString(Date.UTC(2026, 7, 27, 13, 30, 0));
    expect(day1).not.toBe(day2);
  });
});

describe("parseUtcSpaceDatetime", () => {
  test("parses a space-separated datetime string as UTC", () => {
    expect(parseUtcSpaceDatetime("2026-08-26 14:30:00")).toBe(Date.parse("2026-08-26T14:30:00Z"));
  });
});
