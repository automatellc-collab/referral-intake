# Mr. V Appliance Repair — Marketing Site

Static, dependency-free site (plain HTML/CSS/JS, no build step) for Mr. V
Appliance Repair, built from the business details visible on the company
vehicle wrap: name, phone, tagline, and service type.

## Run locally

```bash
cd mr-v-appliance-repair
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy

It's static files — drop the folder on Netlify, Vercel, GitHub Pages, S3+CloudFront,
or any host that serves plain HTML. No build step, no env vars required.

## Before this goes live, the business owner should confirm/fill in

Everything on the page is accurate to what's printed on the vehicle (name, phone
number `(770) 757-3097`, domain `AtlantaApplianceRepairbyMrV.com`, and the
"Reputation built on quality" tagline). A few things were deliberately **not**
invented and need real input before launch:

- **Service area list / towns served** — currently kept general ("Metro
  Atlanta"); add the specific cities/zips actually covered.
- **Business hours** — not shown anywhere; add if there's a published schedule.
- **Reviews/testimonials** — intentionally omitted rather than faked. If there's
  a real Google Business Profile, swap the "Request a callback" card's link
  or add a reviews section pointing to it.
- **Licensing/insurance/years-in-business claims** — none are stated on the
  site. Add only verified numbers if you want to claim them.
- **Contact form** (`#quickForm` in `index.html` / `script.js`) is client-side
  only right now — it shows a "call us" confirmation but doesn't send
  anywhere. Wire it to an email/CRM endpoint (Formspree, a serverless
  function, etc.) before relying on it for real leads.
- **Photography**: `assets/van-wide.jpg` and `assets/mascot-badge.jpg` are
  cropped from a photo of the vehicle taken in traffic — good enough for a
  "spot us around Atlanta" trust element, but a few clean, well-lit shots of
  the van and/or technician would upgrade that section noticeably.

## Structure

- `index.html` — all sections/content
- `styles.css` — design tokens + layout + animations
- `script.js` — scroll reveal, header shrink, mobile nav, magnetic buttons, form
- `assets/` — logo/favicon (hand-drawn SVG "V" mark) + cropped vehicle photos
