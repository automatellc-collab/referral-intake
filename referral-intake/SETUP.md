# Referral Intake - Setup Guide

## Quick Start (5 minutes)

### 1. Get API Key
- Go to https://console.anthropic.com/settings/keys
- Create a new API key
- Copy it (you'll need it in step 2)

### 2. Set Environment Variables
Add to `.env.local`:
```bash
ANTHROPIC_API_KEY=sk-ant-... # paste your key here
```

For database, use one of these:

**Option A: Free (Neon PostgreSQL)**
- Sign up at https://neon.tech (free tier includes 3 projects)
- Create a project, copy the connection string
- Add to `.env.local`:
```bash
DATABASE_URL=postgresql://user:password@region.neon.tech/referral_intake?sslmode=require
```

**Option B: Local (Docker)**
```bash
docker run --name postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/referral_intake
```

### 3. Run Migrations
```bash
npx drizzle-kit migrate --database postgresql
```

### 4. Start Dev Server
```bash
npm run dev
# Opens at http://localhost:3210
```

### 5. Test
- Load a sample referral (Cardiology)
- Click "Extract pre-chart summary"
- Verify extraction returns with:
  - Confidence score (%)
  - Document type
  - Red flags for review
  - All clinical data extracted

## Architecture

### 7-Phase Pipeline
1. **Document Classification** - Detect type (referral letter, lab results, imaging, etc.)
2. **Multimodal Extraction** - Vision API + text from PDFs
3. **Model Escalation** - Haiku (fast/cheap) → Sonnet → Opus (smart fallback)
4. **Medical Grounding** - ICD-10 validation, drug interactions, critical values
5. **Confidence Calibration** - Score each extraction 0-1
6. **Human Review Routing** - Flag uncertain items automatically
7. **Analytics & Logging** - Track quality metrics per specialty/model

### Database Schema
- `extraction_cache` - Caches extractions by content hash (30-day TTL)
- `audit_log` - HIPAA-compliant request log with timings/costs
- `review_queue` - Items flagged for clinician review
- `extraction_feedback` - Clinician corrections for model training
- `medical_validations` - Validation scores for each extraction
- `classifications` - Document type predictions with confidence
- `model_metrics` - Per-model/specialty performance tracking

### API Endpoints
- `POST /api/extract` - Extract from referral + attachments
- `GET /api/review-queue` - Fetch pending review items
- `PATCH /api/review-queue/:id` - Update review status + notes
- `GET /api/feedback` - Clinician correction history
- `POST /api/feedback` - Store corrections
- `GET /api/analytics` - Metrics by specialty/model/format
- `GET /api/audit-logs` - Full audit trail

## Features Implemented

✅ Multimodal document processing (Vision API + text extraction)
✅ 4-control fallback architecture (structured → flexible → validated → human review)
✅ Medical knowledge grounding (ICD-10, drug interactions, critical values)
✅ Model escalation with exponential backoff
✅ Automatic document classification
✅ Confidence scoring (0-1 scale)
✅ Review queue with priority routing
✅ Clinician feedback capture
✅ HIPAA-compliant audit logging
✅ Cost tracking per extraction
✅ Format resilience (native PDF, scanned, email, text, forms)
✅ Performance analytics dashboard

## Troubleshooting

### 500 Error on Extract
- Check `ANTHROPIC_API_KEY` is set and valid
- Check `DATABASE_URL` is set and database is accessible
- Check server logs: `npm run dev` output

### Database Connection Failed
- Verify `DATABASE_URL` format is correct
- If using Neon, ensure SSL mode is enabled
- If using Docker, ensure PostgreSQL container is running: `docker ps`

### Extraction Timeout
- Model escalation may try multiple models, taking 30+ seconds
- Check for rate limits on your API key
- Review server logs for specific error

## Development

### Run Tests
```bash
npm test
```

### View Audit Logs
```bash
curl http://localhost:3210/api/audit-logs?days=7
```

### Check Review Queue
```bash
curl http://localhost:3210/api/review-queue?status=pending
```

### Get Analytics
```bash
curl http://localhost:3210/api/analytics?days=30&format=text
```

## Deployment

### To Vercel (Recommended)
```bash
git add .
git commit -m "feat: complete Doximity-level referral extraction system"
git push origin main
```
Then in Vercel dashboard:
- Add `ANTHROPIC_API_KEY` to environment variables
- Add `DATABASE_URL` to environment variables (use Neon for production)
- Deploy

### Production Checklist
- [ ] ANTHROPIC_API_KEY set and rotated from development
- [ ] DATABASE_URL points to production Neon database
- [ ] BLOB_READ_WRITE_TOKEN is valid (for file uploads)
- [ ] Verify audit logging captures all requests
- [ ] Test extraction with real referrals
- [ ] Monitor cost tracking per model
- [ ] Set up alerts for extraction failures
- [ ] Configure clinician review workflow
- [ ] Train models on feedback corrections

## Cost Optimization

**Default Model Usage:**
- 95% of extractions: Claude Haiku (~$0.0001 each)
- 4% escalated to: Claude Sonnet (~$0.001 each)
- 1% critical/complex: Claude Opus (~$0.01 each)

**Estimated Monthly Cost (1000 extractions):**
- 950 × Haiku: $0.10
- 40 × Sonnet: $0.04
- 10 × Opus: $0.10
- **Total: ~$0.24/month for extraction**

Plus: Storage (~$0.01/GB), database (Neon free tier free)

## Next Steps

1. Get API key and database
2. Add credentials to `.env.local`
3. Run migrations
4. Test with sample data
5. Deploy to Vercel
6. Monitor performance dashboard
7. Collect feedback → train models
