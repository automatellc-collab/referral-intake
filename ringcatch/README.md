# RingCatch — Slice 1

**What it does:** gives you a phone number that answers when you can't, asks the
caller what they need, records it, then **texts you a clean summary** (who called,
what they need, how urgent) with a link to the recording.

On its own this is already a real product — a "never lose a missed call" tool.
It's also the foundation the rest of RingCatch is built on: once call → transcript
→ summary → SMS works reliably, Slice 2 swaps the voicemail for a real AI
conversation that books the job.

---

## The stack (deliberately boring — boring is reliable)

| Piece | Choice | Why |
|---|---|---|
| Language / server | Node.js + Express | Smallest possible thing that handles Twilio webhooks |
| Phone + SMS | **Twilio** | Industry standard, pay-as-you-go, one number to start |
| Transcription | Twilio built-in | Zero extra accounts for Slice 1 (we upgrade to Deepgram in Slice 2) |
| Summary | **Claude Haiku** (optional) | Turns a rambling voicemail into 2–3 tight lines. Skippable. |
| Hosting | **Render** (or Railway/Fly) | One-click deploy from Git, always-on |

Two files do the work: [`server.js`](server.js) (all the logic) and `.env` (your keys).

---

## Accounts you need to create (only you can do this)

1. **Twilio** — https://console.twilio.com
   - Sign up, then **buy one phone number** with Voice + SMS (Twilio Console → Phone Numbers → Buy a number).
   - Grab your **Account SID** and **Auth Token** from the dashboard.
2. **Anthropic** *(optional, for nicer summaries)* — https://console.anthropic.com → create an API key.
3. **Render** *(for going live)* — https://render.com → sign up (connect GitHub).

That's the whole account list. I can't create these or enter payment info for you — but once you have the keys, the code is ready.

---

## What it costs to run

Pay-as-you-go, and tiny at low volume:

| Item | Cost |
|---|---|
| Twilio phone number | ~**$1.15 / month** |
| Inbound call | ~$0.0085 / min |
| Recording | ~$0.0025 / min |
| Twilio transcription | ~$0.05 / min |
| Outbound SMS (the summary) | ~$0.0079 |
| Claude Haiku summary | fractions of a cent per call |
| Render (always-on) | **$7 / month** (Starter) |

**Realistic total: ~$8–10/month fixed, plus roughly ~$0.10 per missed call handled.**
Twilio also gives new accounts trial credit, so early testing is effectively free.

> ⚠️ **Don't use Render's free tier for this.** It sleeps after inactivity and
> cold-starts take 30–50s — long enough to drop the first call. The $7 Starter
> plan stays awake. (Railway and Fly.io are fine alternatives.)

---

## Run it locally in 10 minutes (test before you deploy)

You'll expose your laptop to Twilio with a tunnel (ngrok), so real calls hit your local code.

```bash
cd ringcatch
npm install
cp .env.example .env      # then fill in your Twilio keys + OWNER_PHONE
npm run dev               # starts on http://localhost:3000
```

In a second terminal, tunnel it:

```bash
npx ngrok http 3000       # copy the https URL it prints, e.g. https://abc123.ngrok-free.app
```

Then point your number at it — **Twilio Console → your number → Voice Configuration →
"A call comes in" → Webhook →** paste `https://abc123.ngrok-free.app/voice` (HTTP POST).

**Now call your Twilio number from your cell.** Leave a message like *"Hi, it's Dave,
770-555-1234, my kitchen sink is backed up, can someone come tomorrow."* Hang up.
Within a minute you should get a text summarizing it. 🎉

*(Transcription is async — the SMS arrives a few seconds to a minute after you hang up.)*

---

## Going live on Render (when local works)

1. Push this folder to a GitHub repo.
2. Render → **New → Web Service** → pick the repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Add your `.env` values as **Environment Variables** in Render.
4. Once deployed, set `PUBLIC_URL` to your Render URL (e.g. `https://ringcatch.onrender.com`)
   and `VALIDATE_TWILIO=true`, then redeploy.
5. Update the Twilio number's Voice webhook to `https://ringcatch.onrender.com/voice`.

Done — it now runs 24/7 without your laptop.

---

## How to know Slice 1 is "done"

✅ You call the number → hear the greeting → leave a message
✅ You get a text within ~1 minute with a readable summary + recording link
✅ It survives you hanging up early, saying nothing, and mumbling

When that's rock-solid, we start **Slice 2: it talks back** — replace the voicemail
with a real-time AI conversation, and teach it to actually book the job.

---

## Security notes (before real customers)

- Set `VALIDATE_TWILIO=true` in production so only Twilio can trigger your webhooks.
- **Call recording consent varies by state** — some require a spoken disclosure
  ("this call may be recorded"). Add it to the greeting before you go live for real.
- Never commit `.env`. It's already in `.gitignore`.
