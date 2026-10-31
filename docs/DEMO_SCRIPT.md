# Demo Script — Food Waste Saver (HA040)

Target: ~6 minutes, one laptop, projected. Two browser windows side by side
(or two profiles): **Window A = Provider**, **Window B = Claimer**.
Keep the **Impact Wall** (`/impact`) open on a third tab/screen — it updates
live as the demo runs and is your closing visual.

Before the demo (v3.33 clean-start flow — there are no seeded demo
accounts or listings any more):

1. Optional clean slate: `npm run db:reset-clean --workspace=server -- --yes`
   (guarded: local `food_waste_saver` only; preserves exactly the main
   admin). Then `start.bat` — the seed creates only the main admin
   (`admin@demo.local`, password from `MAIN_ADMIN_PASSWORD` in
   `server/.env`).
2. Register the demo accounts fresh in the app and keep them logged in:
   **Window A** — a User account switched to Donor (provider), **Window
   B** — a User account as Claimer, plus an NGO account registered in a
   third window for the trust-layer step; the main admin verifies the
   NGO from the Admin page when you reach that step (or beforehand).
3. Say clearly: the Impact Wall starts at zero — every figure on it is
   produced live by the actions in this demo, stored in this database.

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
In the NGO window (the account registered before the demo): claim → collect
→ **redistribution log** ("30 portions → shelter") — the dashboard credits
the NGO, not the provider. Main admin window: NGO verification queue +
**audit log** — every admin action is written, append-only. If time allows,
show user management: promote a registered User to admin, and point out
that the main admin itself cannot be demoted or deleted.

**6:00 — Close on the Impact Wall (30 s)**
"Every number on this wall was produced by actions you just watched, stored
in this database. No estimates." Then the ask/vision slide.

## If something goes wrong
- **Wi-Fi/projector issues:** the whole demo is localhost — it cannot be
  taken down by venue internet. If the laptop itself fails, use the backup
  screen recording + screenshots in `docs/demo-backup/` (record these during
  rehearsal).
- **A step errors:** post a fresh listing from Window A (it takes under a
  minute) and run the claim step against that instead.
- **Questions on scale:** answer with the PRD — architecture is a standard
  stateless API + Postgres; the demo posture (single localhost server) is a
  hackathon choice, not a design limit.
