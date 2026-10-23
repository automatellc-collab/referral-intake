# Daily self-improvement cycle

Run once per trading day, after close, headless (`claude -p "$(cat CYCLE.md)"`
or via a scheduled task). Adapted from Phil's settle → score → retro →
edit → research loop for ORB's actual setup: discretionary/manual trade
execution, SQLite-backed settings, and an existing library of backtest
scripts under `scripts/`.

1. **Settle.** Read today's closed rows from `data/trade-log.md` (and any
   new rows in `data/orb-trading.db` trades table). For each, confirm actual
   entry/exit/P&L against the source of truth already documented in
   trade-log.md's reconciliation notes.

2. **Score.** For each closed trade, identify which signal type produced it
   (ORB breakout / FIBONACCI / retest / continuation / SMA-rejection / etc.)
   and whether it matches a pattern already covered by an existing backtest
   script in `scripts/`. Note where live results diverge from that script's
   historical win rate — that divergence is the honest signal, not raw P&L
   (small sample, real slippage, discretionary sizing all add noise).

3. **Retro.** Append an entry to `strategy/retros.md`: verdict on the last
   proposed edit (keep/sharpen/revert), the day's biggest signal-vs-outcome
   miss, and one next-edit candidate.

4. **Propose, don't apply, real changes.** If the next-edit candidate would
   change a live `trading_settings` row (DB) or anything under
   `config/protected.json`'s `protectedPaths`, write it to
   `strategy/proposals.md` with the supporting backtest evidence — do NOT
   edit the DB, `config/protected.json`, or any protected-path file
   directly. The operator applies proposals by hand.

5. **Backtest before proposing.** Before writing a proposal, run (or write,
   if none exists yet) the relevant `scripts/backtest-*.ts` script against
   full available history to get the evidence number cited in step 4. Small
   parameter tweaks (holdBars, entryTypeFilter, requireHighQualityBreakout)
   should reuse `scripts/find-best-config.ts` / `scripts/sweep-hold-duration*.ts`
   patterns rather than one-off scripts, per DRY.

6. **Update the playbook.** Edit `strategy/playbook.md`'s "Current
   configuration" and "Why these values" sections to reflect what's
   actually running today (not what was just proposed — only what's live).

7. **Commit.** Commit changes to `strategy/*.md` and any new
   `scripts/backtest-*.ts` file with message `strategy: <one line>`. Never
   commit changes to `config/protected.json` or any path listed in its
   `protectedPaths` — those require an `operator:`-prefixed commit made by
   the human operator, never by this cycle.

## What this cycle must never do

- Never place a live order or call `lib/robinhood-client.ts` write paths.
  This tool has no automated execution today (see `data/trade-log.md`'s
  exit-monitoring note: alerts only, human closes positions manually) and
  this cycle must not change that.
- Never edit `config/protected.json`, `lib/risk-calculator.ts`,
  `lib/trade-executor.ts`, `lib/robinhood-client.ts`, `lib/db.ts`,
  `lib/repositories/`, or the DB files directly.
- Never raise a cap above what's in `config/protected.json`'s `caps` block,
  even inside a proposal — flag it as needing an operator caps change
  instead.
