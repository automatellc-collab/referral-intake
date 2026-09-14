# Security Checklist

## Pre-Deployment Verification

### Secrets & Environment
- [ ] No hardcoded API keys, tokens, or passwords in code
- [ ] All secrets loaded from `process.env` only
- [ ] `.env.local` added to `.gitignore` (never committed)
- [ ] `.env.example` documents all required vars with descriptions
- [ ] Required env vars validated at startup with clear error messages

### Input Validation
- [ ] All request body fields validated with Zod schemas
- [ ] All query parameters validated
- [ ] Symbol restricted to whitelist: [SPY, QQQ, TSLA, WMT]
- [ ] Price fields > 0, reject zeros and negatives
- [ ] Quantity fields must be positive integers
- [ ] Risk percentages bounded [0.1%, 10%]
- [ ] No string fields exceeding 256 chars (prevent DoS)

### Error Handling & Information Disclosure
- [ ] Error messages never expose: stack traces, internal function names, DB queries, file paths
- [ ] 5xx errors return generic "Internal error" message
- [ ] 4xx errors include field-specific hints (safe for users)
- [ ] No error logging in API responses (log server-side only)
- [ ] Sensitive data (account equity, PnL) rounded in logs, never precise

### Database & Data Access
- [ ] All queries use parameterized statements (via better-sqlite3)
- [ ] No dynamic SQL concatenation
- [ ] Prepared statements cached for performance
- [ ] Database transactions for multi-row operations (trade close + daily stats)
- [ ] Foreign key constraints enabled
- [ ] Backup created at startup

### Authentication & Authorization
- [ ] Single-user auth: APP_ACCESS_TOKEN bearer token required
- [ ] Token validated on every protected route
- [ ] No hardcoded token values
- [ ] Session timeout logic (if applicable)

### Trade Execution Safety
- [ ] Hard spend limit enforced: $500 per trade, $2000 daily max
- [ ] Daily loss limit enforced: block trades after X% loss
- [ ] Position sizing never exceeds account equity
- [ ] Risk/reward ratio validated (min 1:1)
- [ ] Stop loss must be different from entry price
- [ ] Circuit breaker: max 3 consecutive losses, skip next signal

### Logging & Audit Trail
- [ ] All trades logged with entry, exit, P&L (not in API response)
- [ ] All settings changes logged with user, timestamp, old/new values
- [ ] All errors logged with severity, correlationId, stack trace (server-side only)
- [ ] Logs rotated daily, kept for 7 days
- [ ] No PII or credentials in logs
- [ ] Correlation ID on every request for tracing

### Deployment
- [ ] All tests passing (187/187)
- [ ] No `console.log()` in production code (use logger instead)
- [ ] Health check endpoint working: GET /api/health
- [ ] Database migrations applied
- [ ] Error monitoring configured (Sentry or equivalent)
- [ ] Rate limiting headers set on responses
- [ ] CORS headers configured appropriately

### Code Quality
- [ ] No `any` types in TypeScript
- [ ] Functions < 50 lines, files < 800 lines
- [ ] Max nesting depth 3 levels
- [ ] Immutable data patterns (no mutations)
- [ ] Tests for all public functions
- [ ] Comments explain "why," not "what"

---

## Incident Response

### If Data Looks Corrupt
1. Stop accepting trades immediately
2. Log detailed diagnostics to audit log
3. Check data-health reports
4. Roll back to last known-good backup if needed
5. Restart app to clear in-memory cache

### If API Quotas Exhausted
1. Switch to fallback data source
2. Return 502 DATA_UNAVAILABLE status
3. Alert user to retry later
4. Log quota exhaustion event

### If Daily Loss Limit Triggered
1. Block all new trades
2. Allow position closing only
3. Log circuit breaker activation
4. Send alert (email/push if configured)

### If Duplicate Trade Detected
1. Return 409 DuplicateTradeError
2. Log attempted duplicate with timestamp
3. Check if data corruption or API retry

---

## Production Deployment Checklist

```bash
# 1. Environment Setup
export APP_ACCESS_TOKEN=your_secure_token
export NODE_ENV=production

# 2. Database
npm run db:migrate

# 3. Tests
npm test  # Verify 187/187 passing

# 4. Health Check
curl https://yourdomain.com/api/health

# 5. Monitor First Hour
- Watch error logs
- Verify signals firing correctly
- Check trade persistence in DB
- Monitor API response times

# 6. Enable Alerting
- Set up email/Slack for daily loss limit breaches
- Set up Sentry for error monitoring
- Set up CloudWatch/datadog for uptime
```

---

## Review Questions Before Shipping

- [ ] Can I explain every error message users might see?
- [ ] Are all risk gates tested with extreme values?
- [ ] What happens if Yahoo Finance API returns garbage data?
- [ ] What happens if database is locked?
- [ ] Can I recover from a corrupted trade record?
- [ ] Is there a way for users to manually close stuck positions?
- [ ] Who gets alerted if daily loss limit is breached?
- [ ] Are backups automated and tested?
