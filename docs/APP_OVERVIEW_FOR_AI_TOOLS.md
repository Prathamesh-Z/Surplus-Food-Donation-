# Food Waste Saver — Complete App Brief for AI Review

*Purpose of this document: give another AI tool everything it needs to suggest meaningful improvements for this application. Please base suggestions only on what is written here, respect the constraints section, and prefer suggestions that are feasible for a 4-student team before 3 November 2026.*

---

## 1. What the app is

**Food Waste Saver** (registered project title: "Food Waste Management and Surplus Food Redistribution") is a full-stack web application that connects people and organisations with surplus food (canteens, hostels, restaurants, event caterers, households) to people and NGOs who can use it before it spoils. Donors post surplus food with a photo, quantity, pickup location and a hard collection deadline; claimers and NGOs browse nearby listings, claim portions, receive a secure one-time pickup code, and the donor verifies that code at handover. The goal is less food wasted, more food redistributed — the "Food" theme problem of food waste and hunger coexisting in the same city.

## 2. Event context (why it exists)

- **Hackathon 2K26**, Phaltan Education Society's College of Engineering (PESCOE), Phaltan, Maharashtra — **3–4 November 2026**, modelled on Smart India Hackathon. Central theme: "Explore • Create • Conquer".
- **135 registered teams** (HA001–HA135). Our team: **HA040**, theme category: **Food** (each team picks exactly one theme).
- Team of 4 undergraduate students: Prathamesh Zende (lead), Sahil More, Tanvi Patil, Anushka Jamdar — Bharati Vidyapeeth Deemed University, YMIM, Karad. Mentor: Prof. Dr. Ajim Shaikh.
- **Judging criteria (only four, no published weights, treated equally):**
  1. Innovation and originality
  2. Technical complexity and implementation
  3. Feasibility and impact
  4. Presentation and demonstration
- Prizes: Engineering 1st ₹1,00,000, 2nd ₹51,000; plus five ₹5,000 category awards (Best AI/ML, Innovation Excellence, Best Social Impact, Best Emerging Trend, Community Choice).
- Submission: project description, source code, demonstrable prototype, and a PPT in the event format converted to PDF. Results announced the evening of 4 November 2026.
- Closest known competitor: another team (HA103 "FoodBridge") with a similar surplus-food concept.

## 3. Users and roles

- **Provider (donor):** posts surplus food listings, manages them, verifies pickup codes at handover.
- **Claimer (individual):** browses, claims portions, shows pickup code/QR at collection.
- **NGO:** a distinct role; can claim like a claimer (labelled "Unverified" until an admin verifies the organisation), and after collecting food can log where it was redistributed.
- **Admin:** dashboards, user search/suspend, listing removal with reason, NGO verification, append-only audit log. Admins never see pickup codes. Suspended users can still log in and view their history, but every write action is blocked (403).

## 4. Tech stack and architecture

- **Frontend:** React + Vite (single-page app), built and served by the backend server. No separate dev server in the demo.
- **Backend:** Node.js + Express, JWT auth (15-minute access token, 7-day hashed refresh sessions, bcrypt cost 12), Zod validation, role-based middleware, rate limits on auth and pickup verification.
- **Database:** PostgreSQL via Prisma ORM.
- **AI service:** a local Python FastAPI service (port 8001) running all AI on-device; the main app runs on port 4000. **The entire demo runs on one laptop at `http://localhost:4000` with no cloud dependency** — a deliberate design rule.
- **One-click start:** `start.bat` on Windows sets up the DB, seeds synthetic demo data, builds the client, and starts both services.
- **Repo:** GitHub, `Prathamesh-Z/Surplus-Food-Donation-` (private).

## 5. What is BUILT (all verified working)

### Core flow
- Registration/login for all roles, with per-field validation errors and Indian mobile-number normalisation (+91/spaces/leading-0 accepted, stored as clean 10 digits).
- Providers create listings: food name, details, category (Cooked meals / Raw produce / Bakery / Dairy / Packaged food / Beverages / Other + free-text note for Other), dietary type (Veg / Non-veg / Vegan), portion types (individual meals, bulk servings with unit, kg, litres, packets), total portions, NGO-suitable flag, pickup location, cooked-at time, collection deadline (must be in the future, within 24 hours), and an 8-item food-safety checklist that must be fully confirmed to publish.
- Photo upload/capture per listing; photos shown on Browse cards, My Listings, and the detail page.
- Browse with server-side search and filters (category, dietary, NGO-suitable, ending soon, availability) plus sorting: time remaining ↑/↓, vegetarian first, non-vegetarian first, distance nearest/farthest.
- Portion-level claiming inside a single database transaction with row locking (stress-tested: concurrent claims can never over-claim).
- **Pickup codes:** 8 characters (ambiguous characters excluded), stored only as salted SHA-256 hash for verification plus an AES-256-GCM encrypted copy so the owner can re-view it while active; uniqueness via keyed HMAC; all code fields wiped at terminal states. Claimer sees the code + a QR; provider verifies by scanning the QR (camera) or typing the code. 5 wrong attempts → 10-minute lockout. Marking collected is idempotent.
- Cancellation: donors can cancel their own listings (open claims are cascade-cancelled and claimers notified); claimers can cancel their own claims (from My Claims, Browse cards, and the listing page) — cancelling ≥30 minutes before the deadline returns the portions, later cancellations do not.
- Automatic expiry job (every 60 s): expired listings leave Browse, expired claims can't be collected, codes are wiped.
- In-app notifications (polled every 15 s): claim placed/cancelled, listing cancelled, near-deadline warnings (60/30 min thresholds), with unread badge in the nav, mark-read / mark-all-read / dismiss, and click-through to the related listing. Optional email mirror only if SMTP is configured.
- NGO features: redistribution log after collection (destination + portions, capped at collected amount), recurring donation schedules that generate *drafts only* (never auto-publish).
- Impact dashboard computed only from real database records (listed / claimed / collected portions, completion %) with CSV export, plus a public "Impact Wall" page.
- Password reset: single-use token stored as SHA-256 hash only, 30-minute expiry, resets revoke all sessions, generic response that never reveals whether an email is registered; link by email when SMTP is configured, with a documented dev-only mode for local testing.
- Profile page with editable contact number; per-listing donor contact shown only with the donor's opt-in and only on the detail view (never in browse lists).
- UI in **three languages**: English, Marathi, Hindi (172 strings each, per-account persisted preference).
- Expiry-priority indicators on cards: red ≤ 6 h, yellow ≤ 24 h, green > 24 h, grey for expired/unknown — always with a text label, never colour alone.

### AI feature 1 — Indian food recognition from a photo
- When posting, the donor uploads or **scans food with the camera**; recognition runs automatically (no separate button) and auto-fills name, description and category — always editable, never forced.
- Two open-source Vision Transformer models run locally (Apache-2.0): a primary model with 80 Indian dishes, and a specialist with 15 dishes (dosa, pav bhaji, vada pav, dhokla, etc.) that runs only when the primary is unsure and is featured only at a high confidence bar. Scores from the two models are never blended.
- Honest evaluation on 55 real photos (sandbox machine): primary top-1 48.1% / top-3 66.7% on its dishes; specialist 75% / 85% on its dishes; the featured suggestion was right 53.7% of the time on supported dishes; all 6 non-food photos were correctly flagged "uncertain". Temperature scaling (T = 0.25) was fitted on the eval set so confidence separates right from wrong answers. **Known gaps, disclosed in the app docs: idli, samosa, upma and misal pav are in neither model**, and the specialist can be confidently wrong on dishes outside its set — this is documented, not hidden.
- If the AI service is down, the API returns an honest error — there is no fake/mock fallback prediction.

### AI feature 2 — Voice search (fully local)
- Browse has a YouTube-style voice search: tap the round mic button, a full-screen overlay records (with timer), and **Whisper (faster-whisper "small", ~244 MB) transcribes on the same laptop** — English, Hindi and Marathi. An earlier version used Chrome's cloud speech recognition; it failed in the field with a generic "network" error despite working internet, so it was replaced with the local model. The browser recognizer remains only as a fallback if the local service is down.
- Sandbox figures: ~3 s to transcribe an 11-second clip; speech model loads in ~7 s.

### Location
- On first visit the app asks for a location (GPS or typed place name), shown in the header; stored only in the browser (place name + coordinates when GPS is used) and **never sent to the server**. Listings can carry pickup coordinates (stored separately from the address text); distances are computed on-device (Haversine) and shown on cards; coord-less listings always sort last in distance sorts.

## 6. Testing and verification status

- **79/79 automated server tests pass** (14 test files): auth, claims concurrency gates, pickup-code security, cancellations, notifications, coordinates, password reset, speech endpoint, and more. Client production build passes.
- End-to-end flows (register → post → claim → verify → collect; cancels; notifications; reset) were exercised live against the running app in our sandbox.
- Two-device testing is supported: one laptop hosts, the second opens `http://<host-IP>:4000` on the same Wi-Fi (camera/GPS on the second device need a Chrome secure-origin flag — documented).
- Field fixes folded into the current build: automatic access-token refresh (API actions no longer fail when the 15-minute token expires mid-session), a photo-serving path fix (uploaded photos previously 404'd from listing cards), a one-time auto-upgrade in `start.bat` for the voice-search model, and a parser-proof rewrite of `start.bat` (v3.8.1 — CRLF endings + `.gitattributes`) after Windows cmd rejected the earlier script.
- **Not yet done:** a formal performance benchmark of the AI models on the actual demo laptop (sandbox numbers only so far), a refreshed final demo script and rehearsal, backup demo video/screenshots, and the final submission PPT (the originally submitted deck predates the full build).

## 7. Hard constraints for any suggestion

1. Must run **offline on a single Windows laptop** for the live demo (one-time downloads beforehand are fine). No paid APIs or cloud services.
2. The team has days, not weeks: hackathon is 3–4 November 2026. Prefer high-impact, low-risk changes; flag anything that risks destabilising working features.
3. **Honesty rules the team follows:** no invented features, user numbers, partners or pilots; demo data is labelled synthetic; AI limitations are disclosed, not hidden. Suggestions must not rely on exaggerating claims.
4. Event compliance: the submission must be the team's original work built for the event; open-source libraries/models are allowed; pre-built complete solutions are prohibited.
5. Keep the existing stack (React/Express/PostgreSQL/Prisma + local Python AI service). No rewrites.
6. Judging is only on the four criteria in §2 — suggestions tied to a specific criterion are most useful.

## 8. What we want from you

Suggestions to make this app and its presentation stronger for Hackathon 2K26, ideally organised by judging criterion:

- **Innovation:** what genuinely differentiating feature or angle are we missing, within the constraints?
- **Technical complexity:** where could the engineering impress more (or be explained better) without adding fragility?
- **Feasibility & impact:** how do we make the real-world story (who uses this, how it scales beyond a demo, food-safety trust) more convincing and honest?
- **Presentation & demonstration:** how should a 4-person team demo this live in a few minutes — what sequence, what moments land, what could go wrong and how to bulletproof it?
- Anything else: UX gaps, edge cases, or risks in the current design that we should fix before 3 November.
