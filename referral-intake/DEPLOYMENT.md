# Production Deployment Guide

## Pre-Deployment Checklist

- [ ] Neon PostgreSQL database created
- [ ] ANTHROPIC_API_KEY acquired (https://console.anthropic.com/settings/keys)
- [ ] Vercel project linked (https://vercel.com)
- [ ] All tests passing (`npm test`)
- [ ] Build succeeds (`npm run build`)

## Step 1: Set Up Neon Database

1. Sign up at https://neon.tech (free tier)
2. Create a new project
3. Copy the connection string (looks like: `postgresql://user:password@region.neon.tech/dbname?sslmode=require`)
4. Save the connection string for step 3

## Step 2: Deploy to Vercel

### Option A: Deploy from GitHub (Recommended)

```bash
git push origin main
```

Then in Vercel dashboard:
1. Connect your GitHub repository
2. Set environment variables:
   - `ANTHROPIC_API_KEY` - Your API key from Anthropic Console
   - `DATABASE_URL` - Your Neon connection string from step 1
   - `BLOB_READ_WRITE_TOKEN` - (Already configured from Vercel Blob)
3. Click "Deploy"

### Option B: Deploy via CLI

```bash
npm i -g vercel
vercel
# Follow prompts to authenticate and deploy
# Then set environment variables in Vercel dashboard
```

## Step 3: Run Database Migrations

After deployment, run migrations on production database:

```bash
DATABASE_URL="your-neon-connection-string" npx drizzle-kit migrate
```

Or use Vercel Functions to trigger migration on first boot (configure in `.vercel/build.sh`):

```bash
#!/bin/bash
npx drizzle-kit migrate
npm run build
```

## Step 4: Verify Deployment

```bash
# Test the deployment
curl https://your-domain.vercel.app
# Should return the referral intake page

# Test API health
curl https://your-domain.vercel.app/api/health
# Should return { success: true, ... }

# Test extraction (with valid referral)
curl -X POST https://your-domain.vercel.app/api/extract \
  -H "Content-Type: application/json" \
  -d '{
    "specialty": "Cardiology",
    "referralText": "Patient with atrial fibrillation...",
    "attachments": []
  }'
```

## Step 5: Monitor & Optimize

### View Logs
```bash
vercel logs
```

### Check Metrics
```bash
curl https://your-domain.vercel.app/api/analytics?days=7&format=text
```

### View Review Queue
```bash
curl https://your-domain.vercel.app/api/review-queue?status=pending
```

## Cost Breakdown

### Compute (Vercel)
- **Free tier**: Up to 100 GB bandwidth/month
- **Pro**: $20/month + overage
- **Estimate**: <$5/month for typical usage

### Database (Neon)
- **Free tier**: Up to 10GB storage, 3 projects
- **Pro**: Pay-as-you-go
- **Estimate**: <$5/month

### API (Anthropic)
- **Haiku**: $0.80/1M input, $4/1M output (~$0.0001/extraction)
- **Sonnet**: $3/1M input, $15/1M output (~$0.001/extraction)
- **Opus**: $15/1M input, $75/1M output (~$0.01/extraction)
- **Estimate**: $0.24/month for 1000 extractions

**Total**: ~$10-30/month all-in

## Troubleshooting

### 500 Error on /api/extract
1. Check environment variables are set:
   ```bash
   vercel env ls
   ```
2. Check API key is valid:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: $ANTHROPIC_API_KEY" \
     # Should return 400 (no body), not 401 (auth error)
   ```
3. Check database connection:
   ```bash
   curl https://your-domain.vercel.app/api/health
   ```

### Database Migration Failed
```bash
# Re-run migrations
DATABASE_URL="your-url" npx drizzle-kit migrate

# Or check migration status
DATABASE_URL="your-url" npx drizzle-kit introspect
```

### High Costs
- Check `/api/analytics` for model usage breakdown
- Consider implementing model selection based on document type
- Reduce model escalation thresholds
- Use Haiku for simple extractions, escalate only for complex cases

## Scaling Considerations

### For 10K+ extractions/month:
1. Enable caching (already implemented - 30-day TTL)
2. Implement request queuing for peak hours
3. Consider dedicated database (Neon Pro)
4. Add CDN caching for static assets
5. Monitor token usage and implement rate limiting

### For 100K+ extractions/month:
1. Move to self-hosted architecture or dedicated container
2. Implement batch processing endpoints
3. Set up worker queues (e.g., Bull, RQ)
4. Add comprehensive logging/analytics
5. Consider fine-tuning models on your data

## Security

### Secrets Management
- Never commit `.env.local`
- Use Vercel's environment variable UI
- Rotate API keys quarterly
- Enable 2FA on Anthropic console

### HIPAA Compliance
- Enable audit logging (active by default)
- All requests logged with request IDs
- Store in HIPAA-compliant database (Neon supports encryption)
- Consider enabling field-level encryption for extra sensitive data

### Network Security
- Use HTTPS only (Vercel enforces)
- Add rate limiting to API endpoints
- Consider adding API authentication (basic auth, JWT, etc.)
- Monitor for suspicious patterns in `/api/audit-logs`

## Maintenance

### Weekly
- Check error rates in analytics
- Review review queue for stuck items
- Monitor cost tracking

### Monthly
- Analyze feedback corrections for model improvements
- Review slowest extraction types
- Update documentation

### Quarterly
- Rotate API keys
- Audit access logs for suspicious activity
- Plan cost optimization

## Rollback Procedure

If deployment has issues:

```bash
# Revert to previous commit
git revert HEAD

# Push to trigger redeploy
git push origin main

# Or rollback via Vercel dashboard
# Settings → Deployments → Select previous version
```

## Next Steps

1. Deploy to production
2. Test with 10 sample referrals
3. Gather clinician feedback
4. Monitor costs for first week
5. Adjust model escalation thresholds based on quality
6. Train models on feedback corrections
7. Gradually roll out to production use

## Support

- **API Issues**: Check logs at `vercel logs`
- **Database Issues**: Check Neon dashboard
- **Model Issues**: Check Anthropic console for usage/errors
- **Cost Concerns**: Review `/api/analytics` for breakdown
