import type { Candle } from "@/types/trading";

/**
 * Merges candles into coarser bars by bucketing each candle's timestamp into
 * a `bucketMs`-wide window (bucket start = floor(timestamp / bucketMs)). Both
 * US Eastern UTC offsets (EDT -4h, EST -5h) are whole multiples of 10 minutes,
 * so flooring epoch ms this way lines up with ET wall-clock bucket
 * boundaries (e.g. 11:00, 11:10, 11:20 ET) without needing timezone math.
 */
export function aggregateCandles(candles: Candle[], bucketMs: number): Candle[] {
  const buckets = new Map<number, Candle[]>();

  for (const c of candles) {
    const bucketStart = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const bucket = buckets.get(bucketStart);
    if (bucket) {
      bucket.push(c);
    } else {
      buckets.set(bucketStart, [c]);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucketStart, group]) => mergeCandleGroup(group, bucketStart));
}

function mergeCandleGroup(group: Candle[], timestamp: number): Candle {
  const sorted = [...group].sort((a, b) => a.timestamp - b.timestamp);

  return {
    timestamp,
    open: sorted[0].open,
    high: Math.max(...sorted.map((c) => c.high)),
    low: Math.min(...sorted.map((c) => c.low)),
    close: sorted[sorted.length - 1].close,
    volume: sorted.reduce((sum, c) => sum + c.volume, 0),
  };
}
