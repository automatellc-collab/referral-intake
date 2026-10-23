# Retros

One entry per cycle (daily, after market close). Mirrors Phil's
daily-deep-retro: audit the last strategy edit (keep / sharpen / revert),
grade the day's biggest signal-vs-outcome misses, decide the next edit.

Format per entry:

```
## YYYY-MM-DD
Trades reviewed: N (source: data/trade-log.md rows for this date)
Last edit verdict: keep | sharpen | revert — <why>
Biggest miss: <symbol/setup> — signal said X, outcome was Y, because Z
Next edit proposed: <param> <old> -> <new>, backed by <backtest script + result>
```

---
