"use client";

import {
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
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
  /** Shrinks the chart for grid/overview layouts — smaller height, hides
   * axis ticks and level labels, keeps only the essentials. */
  compact?: boolean;
}

const ET_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/New_York",
};

// Intraday SMA over whatever 5-min bars are available today — NOT the
// textbook 200-DAY SMA (that needs ~200 days of daily closes, which this
// chart doesn't fetch). Capped at candles.length so it's always a real,
// fully-formed average rather than a partial one padded with nothing.
const INTRADAY_SMA_PERIOD = 20;

interface CandlePoint {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  sma: number | null;
  // Recharts Bar needs a single numeric value per bar; encode the
  // open/close body as [min, max] and render the high/low wick separately
  // via a custom shape that has access to the full candle via payload.
  bodyRange: [number, number];
}

function buildSeries(candles: Candle[]): CandlePoint[] {
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  return candles.map((c, i) => {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativePV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
    const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : null;

    const windowStart = Math.max(0, i - INTRADAY_SMA_PERIOD + 1);
    const window = candles.slice(windowStart, i + 1);
    const sma = window.length === INTRADAY_SMA_PERIOD
      ? window.reduce((sum, w) => sum + w.close, 0) / window.length
      : null;

    return {
      time: new Date(c.timestamp).toLocaleTimeString("en-US", ET_TIME_FORMAT),
      timestamp: c.timestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
      vwap,
      sma,
      bodyRange: [Math.min(c.open, c.close), Math.max(c.open, c.close)],
    };
  });
}

// Custom Bar shape: draws the high-low wick as a thin vertical line and the
// open-close body as a wider rect, colored green (close >= open) or red.
// Recharts' <Bar> doesn't expose the y-axis scale to a custom shape, but it
// DOES correctly position/size the bar itself from the `bodyRange` [min,max]
// dataKey — so the wick's pixel position is derived from that known body
// geometry (pixels-per-unit from the body's own height/value-range) rather
// than needing the scale function directly.
function Candlestick(props: any) {
  const { x, y, width, height, payload } = props;
  const isUp = payload.close >= payload.open;
  const color = isUp ? "#16a34a" : "#dc2626";
  const [bodyLow, bodyHigh] = payload.bodyRange as [number, number];
  const valueRange = bodyHigh - bodyLow;
  const pixelsPerUnit = valueRange > 0 ? height / valueRange : 0;

  const highY = pixelsPerUnit > 0 ? y - (payload.high - bodyHigh) * pixelsPerUnit : y;
  const lowY = pixelsPerUnit > 0 ? y + height + (bodyLow - payload.low) * pixelsPerUnit : y + height;
  const wickX = x + width / 2;
  const bodyHeight = Math.max(1, height);

  return (
    <g>
      <line x1={wickX} x2={wickX} y1={highY} y2={lowY} stroke={color} strokeWidth={1} />
      <rect x={x} y={y} width={width} height={bodyHeight} fill={color} />
    </g>
  );
}

function OhlcvHeader({ latest, prevClose }: { latest: CandlePoint; prevClose: number | null }) {
  const change = prevClose !== null ? latest.close - prevClose : null;
  const changePct = prevClose !== null && prevClose !== 0 ? (change! / prevClose) * 100 : null;
  const up = change !== null && change >= 0;

  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
      <span>
        O <span className="font-medium text-zinc-800 dark:text-zinc-200">{latest.open.toFixed(2)}</span>
      </span>
      <span>
        H <span className="font-medium text-zinc-800 dark:text-zinc-200">{latest.high.toFixed(2)}</span>
      </span>
      <span>
        L <span className="font-medium text-zinc-800 dark:text-zinc-200">{latest.low.toFixed(2)}</span>
      </span>
      <span>
        C <span className="font-medium text-zinc-800 dark:text-zinc-200">{latest.close.toFixed(2)}</span>
      </span>
      <span>
        V <span className="font-medium text-zinc-800 dark:text-zinc-200">{(latest.volume / 1000).toFixed(1)}K</span>
      </span>
      {change !== null && (
        <span className={up ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-red-600 dark:text-red-400"}>
          {up ? "+" : ""}
          {change.toFixed(2)} ({up ? "+" : ""}
          {changePct!.toFixed(2)}%)
        </span>
      )}
      {latest.vwap !== null && (
        <span>
          VWAP <span className="font-medium text-pink-600 dark:text-pink-400">{latest.vwap.toFixed(2)}</span>
        </span>
      )}
      {latest.sma !== null && (
        <span>
          SMA({INTRADAY_SMA_PERIOD}) <span className="font-medium text-purple-600 dark:text-purple-400">{latest.sma.toFixed(2)}</span>
        </span>
      )}
    </div>
  );
}

export function PriceChart({ candles, openingRange, breakoutDirection, compact = false }: PriceChartProps) {
  const series = buildSeries(candles);

  // The opening-range candle(s) themselves — market open through formedAt
  // (15 min for most symbols, 30 min for the symbols on a wide OR — see
  // WIDE_OPENING_RANGE_SYMBOLS in lib/market-hours.ts). Marked as a shaded
  // band on the time axis, not just the high/low price lines, so the
  // opening range's actual duration is visible at a glance.
  const openingRangeBand =
    openingRange && series.length > 0
      ? (() => {
          const bandCandles = series.filter((c) => c.timestamp <= openingRange.formedAt);
          const startLabel = series[0].time;
          const endLabel = bandCandles.length > 0 ? bandCandles[bandCandles.length - 1].time : startLabel;
          return { startLabel, endLabel };
        })()
      : null;

  const fibLevels =
    openingRange && breakoutDirection
      ? calculateFibonacciLevels(openingRange.low, openingRange.high, breakoutDirection)
      : null;

  // Pad the Y domain so the ORB high/low reference lines (and their labels)
  // stay visible even when price never traded near one side of the opening
  // range — Recharts' "auto" domain only fits the candle data, which would
  // otherwise clip a reference line that sits outside that candle range.
  const priceDomain: [(dataMin: number) => number, (dataMax: number) => number] = [
    (dataMin: number) => (openingRange ? Math.min(dataMin, openingRange.low) : dataMin) * 0.999,
    (dataMax: number) => (openingRange ? Math.max(dataMax, openingRange.high) : dataMax) * 1.001,
  ];

  const height = compact ? "h-40" : "h-[600px]";
  const priceHeight = compact ? "70%" : "75%";
  const volumeHeight = compact ? "30%" : "25%";

  if (series.length === 0) {
    return (
      <div className={`flex ${height} items-center justify-center rounded-md border border-zinc-200 text-xs text-zinc-500 dark:border-zinc-800`}>
        No candle data yet
      </div>
    );
  }

  const latest = series[series.length - 1];
  const prevClose = series.length > 1 ? series[series.length - 2].close : null;

  return (
    <div className={`w-full rounded-md border border-zinc-200 p-2 dark:border-zinc-800`}>
      {!compact && <OhlcvHeader latest={latest} prevClose={prevClose} />}

      <div className={height}>
        <ResponsiveContainer width="100%" height={priceHeight}>
          <ComposedChart data={series} margin={{ top: 4, right: compact ? 4 : 40, left: 0, bottom: 0 }}>
            <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
            <YAxis domain={priceDomain} tick={compact ? false : { fontSize: 10 }} width={compact ? 0 : 55} />
            {!compact && <Tooltip />}

            {openingRangeBand && (
              <ReferenceArea
                x1={openingRangeBand.startLabel}
                x2={openingRangeBand.endLabel}
                fill="#f59e0b"
                fillOpacity={0.15}
                stroke="#f59e0b"
                strokeOpacity={0.4}
                label={compact ? undefined : { value: "Opening range", fontSize: 9, position: "insideTopLeft" }}
              />
            )}

            {openingRange && (
              <>
                <ReferenceLine
                  y={openingRange.high}
                  stroke="#16a34a"
                  strokeDasharray="4 4"
                  label={{
                    value: `ORB-H ${openingRange.high.toFixed(2)}`,
                    fontSize: compact ? 9 : 10,
                    position: "insideRight",
                    fill: "#16a34a",
                  }}
                />
                <ReferenceLine
                  y={openingRange.low}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{
                    value: `ORB-L ${openingRange.low.toFixed(2)}`,
                    fontSize: compact ? 9 : 10,
                    position: "insideRight",
                    fill: "#dc2626",
                  }}
                />
              </>
            )}

            {fibLevels && !compact && (
              <>
                <ReferenceLine y={fibLevels.level236} stroke="#a855f7" strokeDasharray="2 2" label={{ value: "0.236", fontSize: 9, position: "right" }} />
                <ReferenceLine y={fibLevels.level382} stroke="#a855f7" strokeDasharray="2 2" label={{ value: "0.382", fontSize: 9, position: "right" }} />
              </>
            )}

            <Bar dataKey="bodyRange" shape={Candlestick} isAnimationActive={false} />
            <Line type="monotone" dataKey="vwap" stroke="#ec4899" dot={false} strokeWidth={1} connectNulls />
            <Line type="monotone" dataKey="sma" stroke="#a855f7" dot={false} strokeWidth={1} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>

        <ResponsiveContainer width="100%" height={volumeHeight}>
          <BarChart data={series} margin={{ top: 0, right: compact ? 0 : 40, left: 0, bottom: 0 }}>
            <XAxis dataKey="time" tick={compact ? false : { fontSize: 9 }} minTickGap={30} />
            <YAxis domain={[0, "auto"]} tick={false} width={compact ? 0 : 55} />
            <Bar dataKey="volume" isAnimationActive={false}>
              {series.map((c, i) => (
                <Cell key={i} fill={c.close >= c.open ? "#16a34a" : "#dc2626"} fillOpacity={0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
