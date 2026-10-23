"""
Full-year ORB breakout confirmation backtest using real premarket data from
Robinhood's get_equity_historicals (bounds=extended, interval=5minute),
chunked into ~35-day windows to stay under the 5000-bar-per-call cap and
saved to data/backtests/robinhood-chunks/.

Classification per trading day (first ORB breakout only, EOD exit):
  - opening range: high/low of the first 15 minutes of the "reg" session
    (9:30-9:45 ET)
  - premarket high/low: extrema of that day's "pre" session bars
  - prior-day high/low: extrema of the PRIOR trading day's "reg" session bars
  - "confirmed" if a BULLISH breakout's price clears the prior-day high
    OR today's premarket high (BEARISH: clears prior-day low OR premarket low)
  - "unconfirmed" otherwise

Usage: python3 scripts/backtest-robinhood-premarket-confirmation.py
"""
import json
import glob
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
CHUNK_DIR = "data/backtests/robinhood-chunks"
SYMBOLS = ["SPY", "QQQ", "TSLA", "COIN", "CRWD"]

MARKET_OPEN_MIN = 9 * 60 + 30
OR_CLOSE_MIN = 9 * 60 + 45


def load_bars():
    by_symbol = defaultdict(list)
    seen = defaultdict(set)
    for path in glob.glob(f"{CHUNK_DIR}/*.txt"):
        j = json.load(open(path))
        for result in j["data"]["results"]:
            sym = result["symbol"]
            for bar in result["bars"]:
                ts = bar["begins_at"]
                if ts in seen[sym]:
                    continue
                seen[sym].add(ts)
                dt_utc = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                dt_et = dt_utc.astimezone(ET)
                by_symbol[sym].append(
                    {
                        "dt": dt_et,
                        "date": dt_et.strftime("%Y-%m-%d"),
                        "minutes": dt_et.hour * 60 + dt_et.minute,
                        "open": float(bar["open_price"]),
                        "high": float(bar["high_price"]),
                        "low": float(bar["low_price"]),
                        "close": float(bar["close_price"]),
                        "session": bar["session"],
                    }
                )
    for sym in by_symbol:
        by_symbol[sym].sort(key=lambda b: b["dt"])
    return by_symbol


def backtest_symbol(sym, bars):
    by_date = defaultdict(list)
    for b in bars:
        by_date[b["date"]].append(b)
    dates = sorted(by_date.keys())

    confirmed = []
    unconfirmed = []

    for i in range(1, len(dates)):
        date = dates[i]
        prior_date = dates[i - 1]
        day_bars = by_date[date]
        prior_bars = by_date[prior_date]

        prior_reg = [b for b in prior_bars if b["session"] == "reg"]
        if not prior_reg:
            continue
        prior_high = max(b["high"] for b in prior_reg)
        prior_low = min(b["low"] for b in prior_reg)

        pre = [b for b in day_bars if b["session"] == "pre"]
        premarket_high = max((b["high"] for b in pre), default=None)
        premarket_low = min((b["low"] for b in pre), default=None)

        reg = sorted([b for b in day_bars if b["session"] == "reg"], key=lambda b: b["minutes"])
        if not reg:
            continue

        or_bars = [b for b in reg if MARKET_OPEN_MIN <= b["minutes"] < OR_CLOSE_MIN]
        if not or_bars:
            continue
        or_high = max(b["high"] for b in or_bars)
        or_low = min(b["low"] for b in or_bars)
        if or_high <= or_low:
            continue

        post_range = [b for b in reg if b["minutes"] >= OR_CLOSE_MIN]

        breakout = None
        for b in post_range:
            if b["close"] > or_high:
                breakout = ("BULLISH", b["close"])
                break
            if b["close"] < or_low:
                breakout = ("BEARISH", b["close"])
                break
        if breakout is None:
            continue

        direction, breakout_price = breakout
        if direction == "BULLISH":
            is_confirmed = breakout_price > prior_high or (
                premarket_high is not None and breakout_price > premarket_high
            )
        else:
            is_confirmed = breakout_price < prior_low or (
                premarket_low is not None and breakout_price < premarket_low
            )

        eod_close = reg[-1]["close"]
        pnl = (eod_close - breakout_price) if direction == "BULLISH" else (breakout_price - eod_close)

        row = {"date": date, "direction": direction, "pnl": pnl, "won": pnl > 0}
        (confirmed if is_confirmed else unconfirmed).append(row)

    return confirmed, unconfirmed


def summarize(rows):
    if not rows:
        return "no trades"
    wins = sum(1 for r in rows if r["won"])
    total = sum(r["pnl"] for r in rows)
    wr = wins / len(rows) * 100
    avg = total / len(rows)
    return f"{len(rows)} trades  {wr:.1f}% WR  ${total:.2f} total  ${avg:.3f} avg/share"


def main():
    by_symbol = load_bars()
    for sym in SYMBOLS:
        bars = by_symbol.get(sym, [])
        if not bars:
            print(f"\n=== {sym}: no data ===")
            continue
        dates = sorted(set(b["date"] for b in bars))
        confirmed, unconfirmed = backtest_symbol(sym, bars)
        print(f"\n=== {sym} — Robinhood premarket-confirmation backtest, FULL YEAR ===")
        print(f"  span: {dates[0]} -> {dates[-1]} ({len(dates)} trading days, {len(bars)} bars)")
        print(f"confirmed (broke prior-day RTH or premarket level too): {summarize(confirmed)}")
        print(f"unconfirmed (OR level only):                            {summarize(unconfirmed)}")


if __name__ == "__main__":
    main()
