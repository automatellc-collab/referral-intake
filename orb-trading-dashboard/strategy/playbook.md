# ORB Strategy Playbook

This file is the agent-owned, self-editing counterpart to Phil's `strategy/`
folder. It records the CURRENT tunable configuration this system is running
with, and the reasoning behind the last change. It never overrides
`config/protected.json`'s hard ceilings, and it never writes directly to
`data/orb-trading.db` — proposed changes to live `trading_settings` rows go
through `strategy/proposals.md` for the operator to apply by hand, because
trades here are discretionary/manual, not auto-executed.

## Current configuration (as of last cycle)

| Parameter | Value | Source |
|---|---|---|
| entryTypeFilter | (see live settings via `settings-repository.ts`) | DB |
| requireHighQualityBreakout | false | DB, exploratory flag, unvalidated |
| useElevenAmSwitch | false | DB |
| maxHoldMinutes | null (ride to EOD) | DB |
| holdBars (backtest default) | see `scripts/check-holdbars10.ts` | strategy |

## Why these values

_(Filled in by each cycle's retro — cite the specific backtest script and
result that justified the last change, e.g. "switched to FIBONACCI_ONLY
after backtest-fib-confirmed.ts showed +X% win rate over ANY across full
2026 data, n=NN trades.")_

## Open questions / things to test next

_(Populated by the cycle agent — candidate parameter changes not yet
backtested, or backtested but inconclusive.)_
