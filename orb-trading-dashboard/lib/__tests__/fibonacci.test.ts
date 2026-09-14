import { describe, expect, test } from "vitest";
import { calculateFibonacciLevels, isPriceInFibonacciZone } from "@/lib/fibonacci";

describe("calculateFibonacciLevels", () => {
  test("computes retracement levels for a bullish range (low to high)", () => {
    const levels = calculateFibonacciLevels(100, 110, "BULLISH");

    expect(levels.level0).toBe(110);
    expect(levels.level236).toBeCloseTo(107.64, 2);
    expect(levels.level382).toBeCloseTo(106.18, 2);
    expect(levels.level5).toBeCloseTo(105, 2);
    expect(levels.level618).toBeCloseTo(103.82, 2);
    expect(levels.level786).toBeCloseTo(102.14, 2);
    expect(levels.level1).toBe(100);
  });

  test("computes retracement levels for a bearish range (high to low)", () => {
    const levels = calculateFibonacciLevels(100, 110, "BEARISH");

    expect(levels.level0).toBe(100);
    expect(levels.level236).toBeCloseTo(102.36, 2);
    expect(levels.level382).toBeCloseTo(103.82, 2);
    expect(levels.level5).toBeCloseTo(105, 2);
    expect(levels.level618).toBeCloseTo(106.18, 2);
    expect(levels.level786).toBeCloseTo(107.86, 2);
    expect(levels.level1).toBe(110);
  });

  test("throws when low is not less than high", () => {
    expect(() => calculateFibonacciLevels(110, 100, "BULLISH")).toThrow();
    expect(() => calculateFibonacciLevels(100, 100, "BULLISH")).toThrow();
  });
});

describe("isPriceInFibonacciZone", () => {
  test("returns true when bullish price sits between 0.236 and 0.382 retracement", () => {
    const levels = calculateFibonacciLevels(100, 110, "BULLISH");
    expect(isPriceInFibonacciZone(107, levels, "BULLISH")).toBe(true);
  });

  test("returns false when bullish price is outside the 0.236-0.382 zone", () => {
    const levels = calculateFibonacciLevels(100, 110, "BULLISH");
    expect(isPriceInFibonacciZone(109, levels, "BULLISH")).toBe(false);
    expect(isPriceInFibonacciZone(101, levels, "BULLISH")).toBe(false);
  });

  test("returns true when bearish price sits between 0.236 and 0.382 retracement", () => {
    const levels = calculateFibonacciLevels(100, 110, "BEARISH");
    expect(isPriceInFibonacciZone(103, levels, "BEARISH")).toBe(true);
  });

  test("returns false when bearish price is outside the 0.236-0.382 zone", () => {
    const levels = calculateFibonacciLevels(100, 110, "BEARISH");
    expect(isPriceInFibonacciZone(101, levels, "BEARISH")).toBe(false);
    expect(isPriceInFibonacciZone(109, levels, "BEARISH")).toBe(false);
  });
});
