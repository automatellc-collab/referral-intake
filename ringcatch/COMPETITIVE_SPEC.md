# RingCatch — Competitive Spec vs. Rosie (heyrosie.com)

> Source: Rosie's live site, pulled via Agent Reach 2026-07-30. Rosie is the closest analog to RingCatch
> (same customer: "solo owners & small businesses who can't always answer the phone"). Use this to spec Slices 2–4 to parity.
> Rosie facts: founded 2024-04-16 by Jordan Gal, 2,000+ businesses, 3.1m calls handled. Built on Framer. Tagline:
> **"The easiest AI answering service for small business."**

---

## Rosie's plan ladder (what's gated where — this is their real menu)

| | **Professional $49/mo** | **Scale $149/mo** ("Most Popular") | **Growth $299/mo** |
|---|---|---|---|
| Target | solo owner who can't always answer | busy biz that books + routes | high-volume, every call critical |
| Minutes | 250/mo | 1,000/mo | 2,000/mo |
| Message-taking "scenarios" | 2 | 5 | unlimited |
| Spam detection | ✅ | ✅ | ✅ |
| Website chat widget | ✅ | ✅ | ✅ |
| **Calendar appointment booking** | — | ✅ | ✅ |
| **Warm transfer** (briefs team before connecting) | — | ✅ | ✅ |
| **Live transfer** (instant connect) | — | ✅ | ✅ |
| Text caller during call | — | ✅ | ✅ |
| **Waterfall transfer** (tries multiple numbers) | — | — | ✅ |
| Custom agent training (upload docs) | — | — | ✅ |
| White-glove onboarding + priority support | — | — | ✅ |

**Included on EVERY plan:** native iOS & Android apps · 24/7 · handles simultaneous calls (no busy signal) ·
auto-trained from Google Business Profile + website · custom FAQ · 10+ voices · custom agent name & greeting ·
**English & Spanish on every call** · pick your area code · **call summaries, transcripts & recordings** ·
email & text notification per call · Zapier (1,000+ apps).

**Add-ons:** Website Chat (free) · Website Texting $50/mo (25 convos, $1 each after).

**Key model note:** minutes-based with overage. Their whole tiering is really a **transfer/booking capability ladder**,
not a feature-count ladder. $49 = "just answer + take a message." Booking and transfers start at $149.

---

## Rosie's onboarding (their 3 steps — this IS the Slice 4 blueprint)

**STEP 1 — Train.** Owner pastes their website URL or Google Business Profile. Rosie auto-learns hours,
services, and basic info "in seconds." No dev, no tech skills.
**STEP 2 — Review & customize.** Confirm business info, write a custom greeting (casual/professional, rename the agent),
add FAQs (pricing, services, policies, hours), turn on spam filtering, set up "take a message." **Then call the agent to test it.**
**STEP 3 — Go live.** Forward your calls to the agent. Keep-in-loop via text or email.

The auto-train-from-your-website step is the magic trick that makes non-tech owners say yes. **RingCatch has an unfair
advantage here: you already built the client's website, so you have their content, hours, and services on hand — you can
pre-fill the "brain" better than Rosie's scraper can, and you set it up in person.**

---

## Feature-parity map → RingCatch Slices

### Slice 2 — Real-time AI conversation (swap voicemail for talking)
Parity target = Rosie's core $49 answering. To match, Slice 2 needs:
- [ ] Real-time voice conversation (not voicemail). Deepgram STT + LLM + TTS, sub-~1s latency. **Latency is the #1 make-or-break.**
- [ ] Answers FAQs from the business "brain" (hours, services, pricing, policies).
- [ ] **Take a message / capture lead** = structured "scenario" data: name, number, reason, urgency. (Rosie calls these "scenarios"; $49 caps at 2.)
- [ ] Automatic spam filtering (block 1-800s / robocalls, screen sales calls). Cheap win, Rosie ships it at entry tier.
- [ ] Custom greeting + agent name; owner picks a voice.
- [ ] Post-call: summary + transcript + recording, texted/emailed to owner. *(Slice 1 already does the summary+text — extend it.)*
- [ ] **Spanish.** Rosie does English + Spanish on every call. For trades this is a real differentiator, not a nice-to-have.

### Slice 3 — Books the job (Google Calendar + SMS confirmation)
Parity target = Rosie's **Scale $149** booking + transfer tier. To match:
- [ ] Calendar appointment booking (Google Calendar first; Rosie gates this at $149).
- [ ] **Text-a-link scheduling** — agent offers to text the caller a booking link mid-call (Rosie's "text custom links").
- [ ] SMS confirmation to **both** owner and customer.
- [ ] Warm transfer (brief the owner, then connect) + live transfer (instant). This is Rosie's core $149 value.
- [ ] (Growth-tier, later) Waterfall transfer — try multiple numbers until someone answers.

### Slice 4 — Self-serve onboarding wizard
Parity target = Rosie's 3-step flow above. To match:
- [ ] Step 1: ingest a URL / Google Business Profile → auto-draft the brain (hours, services, FAQs).
- [ ] Step 2: plain-English review screen — greeting, FAQs, spam toggle, message scenarios; **"call to test" button** before go-live.
- [ ] Step 3: call-forwarding instructions + number provisioning (pick area code).
- [ ] Trade templates pre-fill ~80% (plumber/barber/HVAC) — your wizard edge over Rosie's generic scraper.

---

## Rosie's FAQ topics (the buyer objections to pre-empt in RingCatch copy + product)
Free trial? · Cancel anytime? · Switch plans? · **What happens if I go over my minutes?** · Setup time? ·
Help setting up? · **Keep my phone number?** · **After-hours / overflow only?** · Which calendars integrate? ·
CRM & tools? · Does it stay updated on my hours? · Native app? · **Is my data secure / are calls recorded / how long stored?** ·
Agency/partner program? · Affiliate program?

(FAQ *answers* are behind a JS accordion — need the browser-login channel or an Exa key to read the exact wording.
The questions themselves are the useful part: they're the objection list to design around.)

---

## Takeaways for the build
1. **$49 tier = answer + FAQ + take-a-message + spam filter.** That's the Slice 2 bar. Everything above is Slice 3.
2. **Booking and transfers are the $149 upsell** — don't give them away free, but they're what makes RingCatch worth more than voicemail.
3. **Copy the auto-train-from-website onboarding**, but do it one better: you already have the client's site.
4. **Ship Spanish.** Cheap with modern models, real edge for trades.
5. **Latency in Slice 2 is the whole ballgame** — a laggy agent loses to voicemail. Budget engineering time accordingly.
