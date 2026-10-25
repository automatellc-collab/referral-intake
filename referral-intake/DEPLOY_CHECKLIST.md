# Deployment Checklist - DO THESE NOW

## Step 1: Create Neon Database (2 minutes)

1. Go to https://neon.tech
2. Sign up or log in
3. Create a new project
4. Copy the connection string (looks like: `postgresql://user:password@region.neon.tech/dbname?sslmode=require`)
5. Save it - you'll need it in step 2

## Step 2: Set Vercel Environment Variables (2 minutes)

1. Go to https://vercel.com/automatellc-collab/referral-intake (or your project dashboard)
2. Click "Settings" → "Environment Variables"
3. Add these variables:

```
ANTHROPIC_API_KEY = (your API key from https://console.anthropic.com/settings/keys)

DATABASE_URL = (paste your Neon connection string from step 1)
```

4. Click "Save"
5. Vercel should auto-redeploy

## Step 3: Run Database Migrations (1 minute)

After deployment completes, run:

```bash
cd /Users/Owner/Desktop/Claude\ Code/referral-intake
DATABASE_URL="your-neon-connection-string" npx drizzle-kit migrate
```

Replace `your-neon-connection-string` with the actual Neon URL from step 1.

## Step 4: Verify Deployment (1 minute)

1. Go to your deployment URL (should be https://referral-intake-xxxx.vercel.app)
2. Load the Cardiology sample
3. Click "Extract pre-chart summary"
4. Should work just like local version

## Done! 🚀

Your production referral intake system is now live with:
- ✅ Claude API (Doximity-level extraction)
- ✅ PostgreSQL database (audit logs, caching, review queue)
- ✅ File uploads to Vercel Blob
- ✅ All 7-phase extraction pipeline

**Cost**: ~$10-30/month all-in
