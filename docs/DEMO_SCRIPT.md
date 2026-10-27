# Demo Script — Food Waste Saver (HA040)

Target: ~6 minutes, one laptop, projected. Two browser windows side by side
(or two profiles): **Window A = Provider**, **Window B = Claimer**.
Keep the **Impact Wall** (`/impact`) open on a third tab/screen — it updates
live as the demo runs and is your closing visual.

Before the demo: `start.bat` (or `npm run dev`), seed data loaded, both
windows already logged in (`provider@demo.local` / `claimer@demo.local`,
password `DemoPass1`). Say clearly: seeded figures are synthetic demo data.

## The spine (timed)

**0:00 — The problem (30 s, PPT)**
UNEP Food Waste Index 2024 figures from our PPT. "The food exists. The people
exist. What's missing is a trustworthy, time-critical matching system."

**0:30 — Provider posts (90 s, Window A)**
Post surplus food → portions 100, deadline ~2 hours → run through the
**8-item food-safety checklist** out loud ("this gate is why an NGO can trust
a listing it has never seen"). Publish. Switch to the Impact Wall: the
listing count moved.

**2:00 — Discovery (60 s, Window B)**
Browse: listings are ordered by **soonest deadline first** — not by distance,
not by ads. Filter: category + "ending within 1 hour". Toggle **मराठी** —
the primary flows are bilingual.

**3:00 — Claim + pickup code (90 s, Window B → A)**
Claim 30 portions → pickup code + **QR** appears. Window A: the claim is
already in My Listings. Verify pickup — scan the QR (or type the code) →
**Collected**. Point at the Impact Wall: portions collected moved live.
Security line, one breath: the code is never stored in plaintext —
salted hash + HMAC uniqueness + encrypted copy only the owner can re-open;
5 wrong attempts lock verification.

**4:30 — Expiry, live (60 s)**
Back in Window A, post a second listing with a **2-minute deadline** (label
it "demo expiry"). Keep talking (NGO flow below) — within ~a minute the
expiry job removes it from browse and expires its claim, and the claimer got
a notification. "No stale food is ever claimable in this system."

**5:15 — NGO + trust layer (45 s)**
Log in as `ngo@demo.local`: claim → collect → **redistribution log**
("30 portions → shelter") — the dashboard credits the NGO, not the provider.
Admin window (`admin@demo.local`): NGO verification queue + **audit log** —
every admin action is written, append-only.

**6:00 — Close on the Impact Wall (30 s)**
"Every number on this wall was produced by actions you just watched, stored
in this database. No estimates." Then the ask/vision slide.

## If something goes wrong
- **Wi-Fi/projector issues:** the whole demo is localhost — it cannot be
  taken down by venue internet. If the laptop itself fails, use the backup
  screen recording + screenshots in `docs/demo-backup/` (record these during
  rehearsal).
- **A step errors:** the seeded demo listings are still on Browse; skip to
  the claim step using one of them.
- **Questions on scale:** answer with the PRD — architecture is a standard
  stateless API + Postgres; the demo posture (single localhost server) is a
  hackathon choice, not a design limit.
