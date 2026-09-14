# ORB Trading Dashboard - Deployment Guide

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
cp .env.example .env.local
# Edit .env.local with your settings:
# APP_ACCESS_TOKEN=your_secure_token
# SQLITE_DB_PATH=./data/orb-trading.db

# 3. Initialize database
npm run db:migrate

# 4. Run tests
npm test  # Should pass 187/187 tests

# 5. Start dev server
npm run dev

# Server runs on http://localhost:3300
```

## Pre-Deployment Checklist

### Code Quality
- [ ] All 187 tests passing (`npm test`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] No linting issues (`npx eslint . --ext .ts,.tsx`)
- [ ] No `console.log()` in production code
- [ ] All functions documented with JSDoc

### Security Audit
- [ ] No hardcoded secrets in code
- [ ] All env vars documented in `.env.example`
- [ ] Input validation schemas in place
- [ ] Error handling doesn't leak internals
- [ ] Database queries use parameterized statements
- [ ] Rate limiting configured
- [ ] CORS headers set correctly

### Database
- [ ] Latest migrations applied
- [ ] Foreign key constraints enabled
- [ ] Backup strategy in place
- [ ] Database file permissions secure (600)

### Configuration
- [ ] APP_ACCESS_TOKEN is strong (32+ chars, random)
- [ ] NODE_ENV set to "production"
- [ ] Market data API key valid (if using Twelve Data)
- [ ] Error monitoring configured (Sentry, etc.)

### Monitoring Setup
- [ ] Health check endpoint accessible
- [ ] Log rotation configured (7-day retention)
- [ ] Error alerts configured
- [ ] Trading alerts configured (daily loss limit breach)
- [ ] Uptime monitoring configured

---

## Deployment to Vercel

```bash
# 1. Create Vercel project
vercel --prod

# 2. Set environment variables in Vercel dashboard
# Settings > Environment Variables
APP_ACCESS_TOKEN=your_secure_token
SQLITE_DB_PATH=./data/orb-trading.db
NODE_ENV=production

# 3. Deploy
git push  # Triggers automatic deployment via GitHub integration

# 4. Verify deployment
curl https://your-domain.vercel.app/api/health
```

### Vercel-Specific Notes
- SQLite database file (`orb-trading.db`) persists in `/data` directory
- Serverless functions timeout: 30 seconds (should be plenty for market data fetch + signal check)
- Cold start: ~500ms (acceptable for non-critical path)

---

## Deployment to AWS (EC2 + RDS)

### Using SQLite (Recommended for Small Scale)
```bash
# 1. EC2 Instance Setup
sudo yum update -y
sudo yum install nodejs npm git -y
git clone <repo> /home/ec2-user/orb-dashboard
cd /home/ec2-user/orb-dashboard

# 2. Install & Configure
npm install
npm run build
cp .env.example .env.production
# Edit .env.production with production values

# 3. Database Setup
npm run db:migrate

# 4. Start with PM2 (process manager)
npm install -g pm2
pm2 start npm --name "orb-dashboard" -- start
pm2 startup
pm2 save
```

### Using PostgreSQL (For Production Scale)
```bash
# In production .env.local:
DATABASE_URL=postgresql://user:password@db-instance.rds.amazonaws.com:5432/orb_trading
```

---

## Post-Deployment Verification

### First Hour Checklist
- [ ] Health check endpoint responds (GET /api/health)
- [ ] Can retrieve market data (GET /api/market-data/quote)
- [ ] Can check settings (GET /api/settings)
- [ ] Signals fire correctly at 9:45 AM ET
- [ ] Trades persist in database
- [ ] Error logs appear in monitoring service
- [ ] Response times < 1 second for most endpoints

### Example Test Flow
```bash
# Set token
export TOKEN="Bearer your_token"

# 1. Health check
curl -H "Authorization: $TOKEN" http://localhost:3300/api/health

# 2. Get opening range (should work if market open)
curl -H "Authorization: $TOKEN" \
  'http://localhost:3300/api/market-data/opening-range?symbol=SPY'

# 3. Check risk limit
curl -H "Authorization: $TOKEN" http://localhost:3300/api/risk/daily-limit

# 4. Execute signal check
curl -X POST -H "Authorization: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"SPY","accountEquity":10000,"profile":"default"}' \
  http://localhost:3300/api/trading/execute
```

---

## Monitoring & Alerting

### Error Monitoring (Sentry)
```bash
# 1. Create Sentry project
# 2. Set SENTRY_DSN in .env
# 3. Errors automatically captured and alerted

# In production .env:
SENTRY_DSN=https://key@sentry.io/project-id
```

### Log Rotation
```bash
# Logs stored in /data/audit.log
# Rotate daily, keep 7 days

# Add to crontab:
0 0 * * * cd /path/to/app && npm run rotate-logs
```

### Alerting Rules
- **Daily Loss Limit Breach**: Immediate email/Slack
- **Data Unavailable (502)**: Alert after 2 consecutive failures
- **Database Connection Lost**: Immediate alert
- **Unhandled Errors**: Batched hourly alert

---

## Troubleshooting

### Market Data Stale (502 Errors)
```bash
# Check data health
curl http://localhost:3300/api/market-data/health

# If stale, usually:
# 1. Yahoo Finance API timeout (check API status)
# 2. Network connectivity issue
# 3. Rate limiting on API

# Temporary fix: Use manual override
curl -X POST -H "Content-Type: application/json" \
  -d '{"symbol":"SPY","accountEquity":10000,"profile":"default","overrideOpeningRange":{"high":551.5,"low":550.0}}' \
  http://localhost:3300/api/trading/execute
```

### Duplicate Trade Errors (409)
```bash
# Check if trade already exists for symbol today
sqlite3 data/orb-trading.db \
  "SELECT * FROM trades WHERE symbol='SPY' AND DATE(created_at) = DATE('now')"

# If duplicate record is corrupted, manually delete:
sqlite3 data/orb-trading.db \
  "DELETE FROM trades WHERE id='trade_123'"
```

### Database Locked
```bash
# Kill stale connections
sqlite3 data/orb-trading.db ".open /dev/null"

# Restart app
pm2 restart orb-dashboard

# If persistent, restore from backup:
cp data/orb-trading.db.backup data/orb-trading.db
npm run db:migrate
```

---

## Backup & Recovery

### Automated Backup
```bash
# Add to crontab (daily at 2 AM)
0 2 * * * cp /path/to/orb-trading.db /path/to/backups/orb-trading-$(date +%Y%m%d).db

# Retention: Keep 30 days of backups
find /path/to/backups -mtime +30 -delete
```

### Restore from Backup
```bash
# 1. Stop app
pm2 stop orb-dashboard

# 2. Restore database
cp /path/to/backups/orb-trading-20260911.db data/orb-trading.db

# 3. Run migrations (if needed)
npm run db:migrate

# 4. Restart
pm2 start orb-dashboard
```

---

## Rollback Procedure

### If Deployment Breaks
```bash
# 1. Check last known-good commit
git log --oneline | head -5

# 2. Revert to previous version
git revert HEAD

# 3. Rebuild and redeploy
npm install
npm run build
npm test
pm2 restart orb-dashboard

# 4. Verify health
curl http://localhost:3300/api/health
```

---

## Performance Tuning

### Response Time Targets
- `/api/trading/execute`: < 500ms (includes market data fetch)
- `/api/trading/positions`: < 100ms (database query)
- `/api/settings`: < 50ms (in-memory cache)

### Optimization Tips
1. Cache market data for 10 seconds (avoid redundant API calls)
2. Index `trades` table on `(user_id, symbol, created_at)` for fast queries
3. Use connection pooling for database
4. Enable gzip compression on responses
5. CDN for static assets (if any)

### Benchmark Current Performance
```bash
# Install Apache Bench
ab -n 100 -c 10 http://localhost:3300/api/trading/positions

# Expected: 50-100 req/sec depending on database size
```

---

## Cost Estimation (AWS)

| Component | Service | Cost/Month |
|-----------|---------|-----------|
| Compute | EC2 t3.micro | $8 |
| Database | SQLite (local) | $0 |
| Storage | EBS 20GB | $2 |
| Data Transfer | Minimal (market data only) | $0-5 |
| **Total** | | **$10-15** |

Scaling to PostgreSQL would add ~$15/month (RDS db.t3.micro).

---

## Support & Escalation

### Common Issues & Contacts
- Market data errors: Check Yahoo Finance API status page
- Trading logic bugs: Review strategy logs in `/data/audit.log`
- Database corruption: Restore from backup, investigate audit log
- Performance issues: Profile with `npm run profile`

### Runbook Links
- [Security Checklist](./SECURITY.md)
- [API Reference](./API.md)
- [Strategy Documentation](./STRATEGY.md)
