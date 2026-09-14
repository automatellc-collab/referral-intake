# ORB Trading Dashboard API Reference

## Base URL
```
http://localhost:3300/api
https://yourdomain.com/api (production)
```

## Authentication
All endpoints require Bearer token in `Authorization` header:
```
Authorization: Bearer <APP_ACCESS_TOKEN>
```

## Response Format
All responses follow this structure:
```json
{
  "success": boolean,
  "data": <T> | null,
  "error": "message" | null
}
```

---

## Endpoints

### Market Data

#### GET /market-data/quote
Get current bid/ask quote for a symbol.

**Query Parameters:**
- `symbol` (required): SPY | QQQ | TSLA | WMT

**Response (200):**
```json
{
  "success": true,
  "data": {
    "symbol": "SPY",
    "bid": 550.5,
    "ask": 550.6,
    "lastPrice": 550.55,
    "volume": 5000000,
    "timestamp": 1694169900000
  }
}
```

**Errors:**
- `400`: Invalid symbol
- `502`: Market data stale (> 5 min old)

---

#### GET /market-data/opening-range
Get today's opening range (9:30-9:45 AM ET).

**Query Parameters:**
- `symbol` (required): SPY | QQQ | TSLA | WMT

**Response (200):**
```json
{
  "success": true,
  "data": {
    "symbol": "SPY",
    "date": "2026-09-11",
    "high": 551.5,
    "low": 550.0,
    "formedAt": 1694169900000
  }
}
```

**Errors:**
- `202`: Opening range not yet formed (before 9:45 AM ET)
- `502`: Data unavailable

---

### Trading

#### POST /trading/execute
Check for ORB signal and execute trade (or alert).

**Body:**
```json
{
  "symbol": "SPY",
  "accountEquity": 10000,
  "profile": "default",
  "overrideOpeningRange": { "high": 551.5, "low": 550.0 }  // Optional, for testing
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "ALERTED" | "EXECUTED" | "NO_SIGNAL" | "DATA_UNAVAILABLE" | "BLOCKED",
    "reason": "RETEST entry signal detected for SPY at 766.00",
    "positionSize": {
      "quantity": 10,
      "riskAmountUsd": 100,
      "positionValueUsd": 7660,
      "cappedByMaxSpend": true
    }
  }
}
```

**Status Codes:**
- `ALERTED`: Signal found, trade simulated (mode-dependent)
- `EXECUTED`: Trade placed (paper mode)
- `NO_SIGNAL`: No breakout or entry conditions met
- `DATA_UNAVAILABLE` (202): Market data stale or opening range incomplete
- `BLOCKED`: Daily loss limit reached, market closed, or duplicate trade

**Errors:**
- `400`: Invalid symbol, negative account equity
- `403`: Insufficient capital, risk limit exceeded
- `409`: Already traded this symbol today
- `502`: Market data unavailable

---

#### GET /trading/positions
List open positions.

**Query Parameters:**
- None

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "trade_123",
      "symbol": "SPY",
      "side": "BUY",
      "entryPrice": 551.0,
      "quantity": 10,
      "stopLoss": 550.0,
      "takeProfit": 553.0,
      "currentPrice": 551.5,
      "unrealizedPnL": 5,
      "unrealizedPnLPct": 0.09,
      "createdAt": "2026-09-11T14:00:00Z"
    }
  ]
}
```

---

#### POST /trading/close
Close an open position at market.

**Body:**
```json
{
  "tradeId": "trade_123",
  "exitPrice": 551.5  // Current market price
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "trade_123",
    "symbol": "SPY",
    "entryPrice": 551.0,
    "exitPrice": 551.5,
    "quantity": 10,
    "realizedPnL": 5,
    "realizedPnLPct": 0.09,
    "exitedAt": "2026-09-11T14:30:00Z"
  }
}
```

---

#### GET /trading/history
Get closed trades history.

**Query Parameters:**
- `limit` (optional, default 50): Max results
- `offset` (optional, default 0): Pagination offset

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "trade_456",
      "symbol": "QQQ",
      "side": "BUY",
      "entryPrice": 716.0,
      "exitPrice": 717.5,
      "quantity": 11,
      "realizedPnL": 16.5,
      "realizedPnLPct": 0.21,
      "holdTime": 1800000  // milliseconds
    }
  ],
  "meta": {
    "total": 47,
    "limit": 50,
    "offset": 0
  }
}
```

---

### Risk Management

#### GET /risk/daily-limit
Check if trading is still allowed (daily loss limit not reached).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "currentLossPct": 1.2,
    "limitPct": 2.0,
    "remainingCapital": 9880,
    "startOfDayEquity": 10000
  }
}
```

**Response (403 - limit breached):**
```json
{
  "success": false,
  "error": "Daily loss limit exceeded: 2.1% > 2.0%"
}
```

---

### Settings

#### GET /settings
Get current trading settings.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "mode": "PAPER",
    "dailyLossLimitPct": 2.0,
    "riskPerTradePct": 1.0,
    "riskRewardRatio": 3,
    "entryTypeFilter": "ANY",
    "fibonacciAnchorMode": "OPENING_RANGE",
    "maxOpenPositions": 3,
    "accountEquity": 10000
  }
}
```

---

#### POST /settings
Update trading settings.

**Body (all optional, at least one required):**
```json
{
  "mode": "PAPER",
  "dailyLossLimitPct": 3.0,
  "riskPerTradePct": 1.5,
  "riskRewardRatio": 4,
  "entryTypeFilter": "FIBONACCI_ONLY",
  "fibonacciAnchorMode": "BREAKOUT_LEG",
  "maxOpenPositions": 5,
  "accountEquity": 15000
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "updated": true,
    "changes": ["dailyLossLimitPct", "accountEquity"]
  }
}
```

**Errors:**
- `400`: No fields provided, or values out of range
- `400`: dailyLossLimitPct must be 0.1% - 10%
- `400`: accountEquity must be positive

---

### Health & Status

#### GET /health
Liveness check.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": 1694169900000,
    "dbConnected": true,
    "configValid": true
  }
}
```

**Response (503):**
```json
{
  "success": false,
  "error": "Database connection failed"
}
```

---

## Error Codes Reference

| Code | Type | Meaning |
|------|------|---------|
| 200 | Success | Request succeeded |
| 202 | Accepted | Signal not ready yet (market closed, ORB not formed) |
| 400 | Bad Request | Invalid input, validation failed |
| 403 | Forbidden | Risk limit breached, insufficient capital |
| 409 | Conflict | Duplicate trade (already traded symbol today) |
| 500 | Internal Error | Server error (masked message) |
| 502 | Bad Gateway | Market data unavailable (stale or API down) |
| 503 | Unavailable | Database not connected |

---

## Rate Limiting

No explicit rate limiting configured. Recommended limits:
- Max 1 request/second per endpoint
- Max 60 requests/minute per client

Set via `X-RateLimit-*` response headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 59
X-RateLimit-Reset: 1694170000
```

---

## Example Workflows

### Monitor & Alert Flow
```
GET /market-data/opening-range?symbol=SPY
├─ 202: Wait for 9:45 AM
└─ 200: Range formed

POST /trading/execute (every 10 seconds during 9:45 AM - 4:00 PM ET)
├─ NO_SIGNAL: Continue monitoring
├─ ALERTED: Log signal, notify user
├─ EXECUTED: Trade placed
├─ DATA_UNAVAILABLE: Retry with exponential backoff
└─ BLOCKED: Check reason, adjust settings if needed
```

### Position Management Flow
```
GET /trading/positions
├─ []: No open positions
└─ [...]: List positions

POST /trading/close
├─ 200: Position closed, P&L realized
└─ 400: Invalid trade ID

GET /risk/daily-limit
├─ 200 (allowed: true): Continue trading
└─ 403: Stop trading, review daily losses
```

---

## Testing with cURL

```bash
# Get opening range
curl -s http://localhost:3300/api/market-data/opening-range?symbol=SPY \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN"

# Execute signal check
curl -s -X POST http://localhost:3300/api/trading/execute \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"SPY","accountEquity":10000,"profile":"default"}'

# Get positions
curl -s http://localhost:3300/api/trading/positions \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN"

# Check daily limit
curl -s http://localhost:3300/api/risk/daily-limit \
  -H "Authorization: Bearer $APP_ACCESS_TOKEN"
```
