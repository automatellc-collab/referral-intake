# Discretionary Trade Log

Manual log of real-money trades taken off ORB signals. One line per trade — entry, size, exit, system signal or discretionary reasoning. Kept plain so sizing anomalies (like PLTR below) are visible without cross-referencing chat history.

| Date | Symbol | Instrument | Entry | Size ($) | Exit | P&L | Signal Basis | Notes |
|------|--------|-----------|-------|----------|------|-----|---------------|-------|
| 2026-09-14 | QQQ | $706C exp 9/14 (0DTE) | $1.56/contract | $312 (2x) | ~$2.00/contract | +$88 (+28.2%) | FIBONACCI, default profile | Stop set at $1.25/contract, exited before stop hit |
| 2026-09-14 | NVDA | $212.50C exp 9/14 (0DTE) | $0.37/contract | $370 (10x) | unknown — user didn't report closing | likely -$370 (100%) if held to expiry | FIBONACCI, default profile | NVDA pulled back to $211.72 before close, never cleared strike with room; unconfirmed whether closed early |
| 2026-09-14 | PLTR | $172.50C exp 9/18 (4 days) | $3.55/contract | $1,775 (5x) | still open as of 4:25 PM close | unrealized, near breakeven | FIBONACCI, default profile | **5x the size of the QQQ trade with no system-driven sizing reason** — flagged by council review 2026-09-15 |

## Sizing rule (per council review 2026-09-15)

System default risk unit: $100 risk per trade (per `TradingSettings.riskPerTradePct` × account equity). Any position sized meaningfully above that — like the PLTR trade — should be a **deliberate, pre-market decision**, not an in-the-moment call. Log the reasoning here when it happens.

## How to update this log

Add a row after every real trade. Don't wait to "remember later" — the PLTR sizing anomaly was only caught because someone happened to compare it against the QQQ trade in conversation, not because it was tracked anywhere.
