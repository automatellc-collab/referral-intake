# Discretionary Trade Log

Manual log of real-money trades taken off ORB signals. One line per trade — entry, size, exit, system signal or discretionary reasoning. Only log trades the user has explicitly confirmed as real — do not infer a position exists just because a signal fired and was discussed.

**Correction (2026-09-15):** The PLTR $172.50C position previously logged here never existed — the user confirmed no PLTR position was taken. It was inferred from conversation (discussing the signal, checking price vs. strike) without an explicit "I bought this" confirmation. Removed. The council review's "5x oversized position" finding was based on this incorrect entry and should be treated as invalidated for that specific claim — the other findings (freshness field gap, symbol list scope creep, lack of pre-live validation) stand independent of it.

| Date | Symbol | Instrument | Entry | Size ($) | Exit | P&L | Signal Basis | Notes |
|------|--------|-----------|-------|----------|------|-----|---------------|-------|
| 2026-09-14 | QQQ | $706C exp 9/14 (0DTE) | $1.56/contract | $312 (2x) | ~$2.00/contract | +$88 (+28.2%) | FIBONACCI, default profile | Stop set at $1.25/contract, exited before stop hit |
| 2026-09-14 | NVDA | $212.50C exp 9/14 (0DTE) | $0.37/contract | $370 (10x) | unknown — user didn't report closing | likely -$370 (100%) if held to expiry | FIBONACCI, default profile | NVDA pulled back to $211.72 before close, never cleared strike with room; unconfirmed whether closed early |

## Logging rule

Only add a row when the user explicitly states they took the trade (e.g. "I bought X contracts of Y at Z"). Checking a signal, discussing whether to enter, or tracking price relative to a strike is NOT confirmation of a position — don't log it as one. This log going forward relies on the user proactively reporting trades, per their note on 2026-09-15 that they hadn't been notifying about all trades taken.

## Sizing rule

System default risk unit: $100 risk per trade (per `TradingSettings.riskPerTradePct` × account equity). Any position sized meaningfully above that should be a **deliberate, pre-market decision**, not an in-the-moment call — flag it when it happens, but only for confirmed real trades.
