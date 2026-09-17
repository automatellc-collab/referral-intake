export type TradingMode = "AUTOMATED" | "ALERTS" | "PAPER";

export type TradeSide = "BUY" | "SELL";

export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";

export type ORBDirection = "BULLISH" | "BEARISH";

export type EntryType = "RETEST" | "FIBONACCI";

/**
 * Which two price points the Fibonacci fallback entry retraces between.
 * OPENING_RANGE: the opening-range low-to-high (original interpretation).
 * BREAKOUT_LEG: the ORB level to the swing high/low reached after breakout
 * (tighter, follows the actual move rather than the fixed opening range).
 */
export type FibonacciAnchorMode = "OPENING_RANGE" | "BREAKOUT_LEG";

/** Restrict which entry types are ever taken. Backtesting showed Fibonacci
 * entries outperforming retest entries — this lets that be enforced live. */
export type EntryTypeFilter = "ANY" | "RETEST_ONLY" | "FIBONACCI_ONLY";

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OpeningRange {
  symbol: string;
  date: string;
  high: number;
  low: number;
  formedAt: number;
}

export interface ORBSignal {
  symbol: string;
  direction: ORBDirection;
  openingRange: OpeningRange;
  breakoutPrice: number;
  breakoutAt: number;
}

export interface FibonacciLevels {
  level0: number;
  level236: number;
  level382: number;
  level5: number;
  level618: number;
  level786: number;
  level1: number;
}

export interface EntrySignal {
  type: EntryType;
  symbol: string;
  direction: ORBDirection;
  price: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  detectedAt: number;
}

export interface TradingSettings {
  userId: string;
  mode: TradingMode;
  symbols: string[];
  dailyLossLimitPct: number;
  riskPerTradePct: number;
  maxOpenPositions: number;
  riskRewardRatio: number;
  stopLossBufferPct: number;
  maxConsecutiveLosses: number;
  maxTradePerOrderUsd: number;
  maxDailySpendUsd: number;
  fibonacciAnchorMode: FibonacciAnchorMode;
  entryTypeFilter: EntryTypeFilter;
  /** Force-close a trade this many minutes after entry if stop/target hasn't
   * hit yet, instead of riding to end of day. Null = no limit (ride to EOD). */
  maxHoldMinutes: number | null;
  /** After 11am ET, merge 5-min candles into 10-min bars for signal detection.
   * Reduces false signals from midday chop. Default: false. */
  useElevenAmSwitch: boolean;
}

export interface Trade {
  id: string;
  userId: string;
  symbol: string;
  side: TradeSide;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  actualExitPrice: number | null;
  mode: TradingMode;
  status: TradeStatus;
  pnl: number | null;
  createdAt: string;
  closedAt: string | null;
}

export interface DailyStats {
  userId: string;
  tradingDate: string;
  startingEquity: number;
  currentEquity: number;
  dailyPnl: number;
  dailyPnlPct: number;
  numTrades: number;
  consecutiveLosses: number;
}

export interface DailyLimitCheck {
  allowed: boolean;
  reason: string | null;
  currentLossPct: number;
  limitPct: number;
}

export interface PositionSizeResult {
  quantity: number;
  riskAmountUsd: number;
  positionValueUsd: number;
  cappedByMaxSpend: boolean;
}
