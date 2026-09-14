# ORB Trading Dashboard

Opening Range Breakout (9:30–9:45 AM ET) strategy dashboard with Paper,
Alerts, and Automated trading modes, daily loss limits, Fibonacci-zone
entries, and backtesting.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Visit `http://localhost:3300` (configured via `.claude/launch.json`) or
`http://localhost:3000` if you run `npm run dev` directly.

Data persists to a local SQLite file at `data/orb-trading.db` (created
automatically). This is fine for local/personal use; a Vercel deployment's
filesystem is ephemeral, so data won't survive redeploys there — swap
`lib/db.ts` for a hosted Postgres connection (e.g. Supabase, Vercel Postgres)
before relying on a cloud deployment long-term.

## Trading modes

- **PAPER** (default): simulated trades, no real money.
- **ALERTS**: computes entry signals and surfaces them (in-app + browser
  notification); you place the trade yourself. No order is submitted.
- **AUTOMATED**: **not implemented.** Selecting it will always return
  `BLOCKED` with a clear reason — see "Known limitations" below.

Configure mode and risk parameters at `/settings`.

## Live market data

Live quotes and candles come from Yahoo Finance's public chart endpoint —
no API key, no account, no tracked quota. It also includes pre-market and
after-hours candles, unlike the Twelve Data free tier this originally used
(swapped 2026-09-01 after that tier's lack of pre-market data hid an
overnight gap). This is not an officially documented/supported API — it's
the same endpoint behind the `yfinance` Python library — so it could
change shape or get rate-limited without notice; there's no SLA. Intraday
history is capped at Yahoo's own ~59-day lookback limit for sub-daily
candles.

For a full-year 5-minute backtest beyond that window, `scripts/backtest-full-year.ts`
and `scripts/backtest-1min.ts` still page through Twelve Data directly
(unrelated to the live app) — set `TWELVE_DATA_API_KEY` in `.env.local`
only if you want to run those specific scripts.

**Note on Robinhood:** this app deliberately does **not** log into
Robinhood. Robinhood has no official public trading API — the only way to
place orders programmatically is via reverse-engineered endpoints that
require your real account password and replicate their mobile app's 2FA/
device-approval handshake. That's against their Terms of Service and was
judged not worth building, even for read-only data access. `lib/robinhood-client.ts`
exists only as an intentionally-unimplemented stub for AUTOMATED-mode order
placement, gated behind `ROBINHOOD_LIVE_TRADING_ENABLED` — it does nothing
today.

## Known limitations (by design, not oversight)

- **AUTOMATED mode is not implemented.** No Robinhood integration exists —
  see above. If you ever want real order placement, that's a separate,
  deliberately-scoped piece of work with its own review, not something to
  bolt on quietly.
- **Single-user.** No login system; all data is keyed to a constant
  `"default"` user id (`lib/api-auth.ts`). If you deploy this to a public
  URL, set `APP_ACCESS_TOKEN` to gate the API routes behind a shared
  secret — otherwise anyone with the URL can read/write your trading data.
- **No email delivery.** ALERTS mode notifies in-browser only
  (`Notification` API); wiring an email provider (e.g. Resend) is a small
  addition to `lib/trade-executor.ts` if you want it.
- **SQLite, not Postgres.** Chosen for zero-setup local development. Swap
  `lib/db.ts` for a hosted database before depending on this in production
  on Vercel (serverless filesystems don't persist writes).

## Strategy logic (from the source video)

- Opening range = high/low of the 9:30–9:44 AM ET candle.
- Breakout above/below that range sets bias for the day.
- Entry either on (a) a retest of the ORB level with a rejection candle, or
  (b) if price never retests, a pullback into the 0.236–0.382 Fibonacci
  zone of the opening range.
- Stop loss at the opposite side of the opening range; default 1:3 risk/reward.

Implemented in `lib/orb-strategy.ts`, `lib/fibonacci.ts`, `lib/market-hours.ts`.

**Caveat:** this strategy was sourced from a social-media trading account
whose caption asked viewers to comment for a paid course — it is not a
vetted or independently backtested strategy. Use the `/backtest` page
before trusting it with real money, and treat PAPER mode as the default,
not a formality.

## Testing

```bash
npm test        # run once
npm run test:watch
```

Tests cover strategy logic, risk math, repositories, the Twelve Data
client's pure parsing functions, the Robinhood order-payload stub, the
trade executor's mode/risk gating, the backtest engine, and API route
integration tests.

## Architecture

```
lib/
  orb-strategy.ts          # opening range, breakout, entry signal detection
  fibonacci.ts              # retracement level math
  market-hours.ts           # ET session window helpers
  risk-calculator.ts        # daily loss limit, circuit breaker, position sizing
  market-data-client.ts     # Twelve Data adapter (live quotes + candles)
  robinhood-client.ts       # intentionally-unimplemented order-placement stub
  market-data.ts            # symbol snapshot (quote + candles + opening range)
  trade-executor.ts         # mode-aware execution with risk gates
  backtest-engine.ts        # multi-day strategy simulation
  db.ts                     # SQLite connection + schema
  repositories/             # data access (trades, settings, daily stats)
app/
  api/                      # REST endpoints backing the UI
  dashboard/ settings/ backtest/   # pages
components/ hooks/           # UI building blocks
```
