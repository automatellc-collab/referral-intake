# Discretionary Trade Log

Verified against actual Robinhood order history (account ••••4232, "investing") via connected MCP. Pulled 2026-09-15, covering 2026-09-08 onward. Single-leg directional option trades only (calls/puts bought or sold to open, then closed) — multi-leg spread/roll orders excluded (see note at bottom; those belong to a separate income/wheel strategy, not ORB signals).

## Verified Trades, 2026-09-08 through 2026-09-14

| Date | Symbol | Contract | Buy | Sell | Contracts | Net P&L |
|------|--------|----------|-----|------|-----------|---------|
| 09-08 | TSLA | $370C exp 9/9 | $2.40 | $3.00/$3.25 | 3 | **+$214** |
| 09-08 | TSLA | $362.50C exp 9/9 | $4.40 | $6.00/$6.25/$6.50 | 3 | **+$555** |
| 09-09 | QQQ | $718C exp 9/10 | $2.92 | $3.90 | 1 | **+$103** |
| 09-09 | NVDA | $222.50P exp 9/11 | $2.01/$1.76 | $2.10/$2.20 | 7 | **+$148** |
| 09-09 | PLTR | $175C exp 9/11 (short) | — | $1.16 | 1 | **+$117** (expired OTM, kept premium) |
| 09-10 | AAPL | $315C exp 9/11 | $4.65 | $7.00/$5.80 | 2 | **+$350** |
| 09-10 | AAPL | $317.50C exp 9/11 | $3.45 | $5.30/$4.15 | 3 | **+$440** |
| 09-10 | QQQ | $715P exp 9/10 | $3.00/$2.82/$2.34 | $6.40/$7.00 | 10 | **+$3,716** |
| 09-10 | QQQ | $711C exp 9/11 | $4.00 | $4.10 | 3 | **+$39** |
| 09-10 | SPY | $757P exp 9/11 | $3.05 | $2.15 | 3 | **-$258** (only loss) |
| 09-10 | TSLA | $365C exp 9/11 | $4.80 | $5.50 | 1 | **+$76** |
| 09-10 | NVDA | $217.50P exp 9/11 | $1.75 | $1.80 | 5 | **+$25** |
| 09-10 | PLTR | $170C exp 9/11 | $1.55/$3.30 (2 opens) | $1.60/$1.75/$3.45 | 5 | **+$70** |
| 09-11 | QQQ | $716P exp 9/14 | $2.67 | $3.00 | 5 | **+$165** |
| 09-14 | SPY | $761C exp 9/15 | $1.92/$1.96/$1.69 | $2.25/$2.00/$2.10 | 15 (3 rounds) | **+$360** |
| 09-14 | QQQ | $706C exp 9/15 | $2.93 | $3.87 | 5 | **+$470** |
| 09-14 | TSLA | $357.50P exp 9/14 (0DTE) | $1.897 avg | $2.15 | 3 | **+$77** |
| 09-14 | AMD | $492.50C exp 9/14 (0DTE) | $2.13 | $2.40/$2.60 | 3 | **+$101** |
| 09-14 | NVDA | $212.50C exp 9/14 (0DTE) | $0.37 | $0.45/$0.48 | 10 | **+$83** |
| 09-14 | PLTR | $172.50C exp 9/18 | $3.55 | $3.70 (13-min hold) | 5 | **+$75** |

**Total verified net P&L, 09-08 to 09-14: +$6,926 across 20 trades. 19 wins, 1 loss (-$258 on SPY put, 09-10). Win rate: 95%.**

All positions closed same day or within the window — no open exposure remaining from this list as of 2026-09-15.

## Other account activity (not ORB-signal trades, logged for context only)

- **Equity purchases:** PLTR 100 shares @ $171.28 (09-09), LAC 100 shares @ $3.19 (09-09), GLW 100 shares @ ~$144.66 (09-15, ongoing), MRAAY sold 100 shares @ $23.87 (09-10) — longer-term stock positions, unrelated to day-trading signals.
- **Multi-leg spread/roll orders excluded from the table above** (separate covered-call/wheel income strategy, not ORB-driven): rolls on NOW, ACHR, GOOGL, MRLN, TSLA ($450C), ECHO; a 2-leg AAPL 315/320 call spread (opened debit $1,388, closed credit $1,620, net +$232, excluded since it's a spread not a simple directional bet).

## Process note (2026-09-15)

This log was rebuilt from scratch by querying `get_option_orders` / `get_equity_orders` directly (account ••••4232) rather than from conversation-reported figures, which were wrong in several cases for 09-14 (NVDA logged as a likely loss when it was a win; PLTR logged as an oversized held position when it was a 13-minute scalp; QQQ's size and P&L were both off).

**Going forward:** pull from the Robinhood MCP to verify trade history rather than relying solely on what's mentioned in conversation. When the user reports a trade in chat, treat it as a pointer to go verify, not as the final number.

## Sizing rule

System default risk unit: $100 risk per trade (per `TradingSettings.riskPerTradePct` × account equity). Actual position sizes ranged 1-15 contracts across these trades — normal variation for scalping options at different premium levels, not itself evidence of undisciplined sizing.
