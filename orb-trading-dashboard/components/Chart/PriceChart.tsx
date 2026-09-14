"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { calculateFibonacciLevels } from "@/lib/fibonacci";
import type { Candle, ORBDirection, OpeningRange } from "@/types/trading";

interface PriceChartProps {
  candles: Candle[];
  openingRange: OpeningRange | null;
  breakoutDirection: ORBDirection | null;
}

export function PriceChart({ candles, openingRange, breakoutDirection }: PriceChartProps) {
  const chartData = candles.map((c) => ({
    time: new Date(c.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/New_York",
    }),
    close: c.close,
  }));

  const fibLevels =
    openingRange && breakoutDirection
      ? calculateFibonacciLevels(openingRange.low, openingRange.high, breakoutDirection)
      : null;

  if (chartData.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-md border border-zinc-200 text-sm text-zinc-500 dark:border-zinc-800">
        No candle data yet
      </div>
    );
  }

  return (
    <div className="h-80 w-full rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} minTickGap={30} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={60} />
          <Tooltip />
          <Line type="monotone" dataKey="close" stroke="#2563eb" dot={false} strokeWidth={1.5} />

          {openingRange && (
            <>
              <ReferenceLine
                y={openingRange.high}
                stroke="#16a34a"
                strokeDasharray="4 4"
                label={{ value: "ORB High", fontSize: 10, position: "right" }}
              />
              <ReferenceLine
                y={openingRange.low}
                stroke="#dc2626"
                strokeDasharray="4 4"
                label={{ value: "ORB Low", fontSize: 10, position: "right" }}
              />
            </>
          )}

          {fibLevels && (
            <>
              <ReferenceLine
                y={fibLevels.level236}
                stroke="#a855f7"
                strokeDasharray="2 2"
                label={{ value: "0.236", fontSize: 9, position: "right" }}
              />
              <ReferenceLine
                y={fibLevels.level382}
                stroke="#a855f7"
                strokeDasharray="2 2"
                label={{ value: "0.382", fontSize: 9, position: "right" }}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
