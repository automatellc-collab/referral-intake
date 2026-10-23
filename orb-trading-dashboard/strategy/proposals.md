# Proposals (agent → operator)

Changes only the operator can make: edits to live `trading_settings` in the
DB, changes to `config/protected.json`'s caps, or anything touching
`lib/robinhood-client.ts` / real order flow. The cycle agent writes a
proposal here with evidence; it never applies these itself.

Format per entry:

```
## YYYY-MM-DD: <one-line ask>
Evidence: <backtest script + result, or trade-log pattern>
Risk: <what could go wrong if applied>
Status: pending | applied (operator, date) | rejected (reason)
```

---
