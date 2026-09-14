import type { FibonacciLevels, ORBDirection } from "@/types/trading";

const RETRACEMENT_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export function calculateFibonacciLevels(
  low: number,
  high: number,
  direction: ORBDirection,
): FibonacciLevels {
  if (low >= high) {
    throw new Error("low must be strictly less than high");
  }

  const range = high - low;

  const priceAtRatio = (ratio: number) =>
    direction === "BULLISH" ? high - range * ratio : low + range * ratio;

  const [r0, r236, r382, r5, r618, r786, r1] = RETRACEMENT_RATIOS.map(priceAtRatio);

  return {
    level0: r0,
    level236: r236,
    level382: r382,
    level5: r5,
    level618: r618,
    level786: r786,
    level1: r1,
  };
}

export function isPriceInFibonacciZone(
  price: number,
  levels: FibonacciLevels,
  direction: ORBDirection,
): boolean {
  const zoneLow = direction === "BULLISH" ? levels.level382 : levels.level236;
  const zoneHigh = direction === "BULLISH" ? levels.level236 : levels.level382;

  return price >= zoneLow && price <= zoneHigh;
}
