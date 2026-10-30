# Food Waste Saver — Testing & Stabilization Roadmap

**Status:** APPROVED 2026-10-30 with the execution adjustment below — no
fixes or code changes are authorized beyond the approved process (one task
at a time; reproduce → root cause → smallest fix proposed → approval →
regression → record).
**Approved execution adjustment (2026-10-30):** demo readiness outranks
completing every low-priority task. M12 (recognition) and M13 (voice)
verification move UP alongside Phase 0 — the working order is now
M0 + M16 first, with M12/M13 laptop verification immediately after the
environment is proven, before the Phase 1–3 module grind. Everything else
in this document (order, dependencies, freeze rules) is unchanged.
Progress is recorded only in `docs/TESTING_RECORD.md`.
**Baseline:** repo `main` at merge commit `d4eb611` (PRD v3.9.1 + PR #1 merged).
**Verified baseline facts (2026-10-30):** server suite **94/94 passing**
(16 files, vitest + supertest against a real test database); client
production build passes; sandbox live-flow checks passed for claims,
pickup verification, voice transcription, and recognition.
**How to use this document:** execute phases in order. A module is
*Verified* only when every Critical/High task in it passes, its automated
tests are green, and the result is entered in the Test Record (Section 6).
Once Verified, a module is frozen under the rules in Section 7.

**Scope change (2026-10-30, PRD v3.10):** voice search was REMOVED at the
user's direction (Change 1 of the voice-removal + manual-entry request).
Module M13 is closed as *Removed by decision*; its tasks are void, not
failed. The inference service is healthy when the two food models load —
there is no Whisper model any more, and no checklist should expect one.
Manual food entry (Change 2) follows separately.

Priorities: **Critical** = core function, security, data integrity, or
app-breaking. **High** = important function / major workflow failure.
**Medium** = non-critical bugs, inconsistencies, usability. **Low** = polish.

---

## 1. Codebase audit (what actually exists)

### 1.1 Module inventory

| # | Module | Main files | Automated tests today | Status |
|---|--------|-----------|----------------------|--------|
| M0 | Environment & startup | `start.bat`, `server/.env.example`, `inference/requirements.txt`, seed | none | Works on sandbox; laptop port-8001 conflict seen 28 Oct, unconfirmed resolved |
| M1 | Foundation (app, health, uploads, config) | `server/src/app.js`, `index.js`, `lib/uploads.js`, `jobs/index.js` | health.test.js (3) | Passing |
| M2 | Auth & accounts (register, login, refresh, logout, reset, invite) | `routes/auth.js`, `services/authService.js`, `middleware/auth.js`, `validators/auth.js` | auth (6), v36 (7), invite (7), qa-fixes (part) | Passing; two API contract changes landed with PR #1 (see §1.4) |
| M3 | Users & profile (contact, language) | `routes/users.js`, `pages/Profile.jsx` | contact (5), p1 (language) | Passing |
| M4 | Listings core (create, publish, edit, cancel, photo, coordinates) | `routes/listings.js`, `services/listingService.js`, `validators/listings.js` | listings (9), coordinates (3), qa-fixes (part) | Passing |
| M5 | Discovery (browse, search, filters, sort, public access) | `routes/listings.js` GET, `pages/Browse.jsx` | browse (6), qa-fixes (QA-05) | Passing |
| M6 | Claims & pickup codes | `routes/claims.js`, `services/pickupCodeService.js`, `components/Pickup.jsx` | claims (9) incl. both concurrency gates | Passing |
| M7 | Expiry & notifications | `services/expiryService.js`, `routes/notifications.js`, `jobs/index.js` | expiry (4), v36 (dismiss) | Passing |
| M8 | Dashboard, impact, CSV, public wall | `routes/dashboard.js`, `services/impactService.js` | dashboard (4), p2 (3) | Passing |
| M9 | NGO (verification state, redistribution log) | `routes/ngo.js`, `pages/NgoPanel.jsx` | p1 (FR-16/17, partial) | Partially covered — log edit/delete thin |
| M10 | Admin (stats, users, suspend, remove, NGO verify, audit) | `routes/admin.js`, `services/auditService.js` | p1 (partial) | Partially covered — list/audit endpoints thin |
| M11 | Recurring donations | `routes/recurring.js`, `services/recurringService.js` | p1 (FR-18, partial) | Partially covered — PATCH/DELETE thin |
| M12 | AI food recognition | `inference/app.py`, `models.py`, `services/recognitionService.js`, `data/dishInfo.js` | recognition.test.js (8, transport stubbed) | Endpoint covered; real-model quality evaluated once (sandbox, 55 photos) |
| M13 | Voice search — **REMOVED 2026-10-30 (PRD v3.10)** | — (files deleted) | — (speech.test.js deleted with the feature) | Closed as Removed by decision; tasks void |
| M14 | Client shell (nav, AuthContext, location, i18n, responsive) | `App.jsx`, `components/Nav.jsx`, `location/LocationContext.jsx`, `i18n/strings.js` (182 keys × EN/MR/HI) | **none** (no client test runner) | Manual testing only — biggest coverage gap |
| M15 | Email mirror (optional SMTP) | `services/emailService.js` | p2 (FR-24: no-op + transport stub) | Passing; real SMTP never exercised |
| M16 | Two-device / LAN demo mode | Express binds all interfaces; phone-hotspot setup | none | Explained, never confirmed run by the team |

### 1.2 Integrations and external dependencies

- **PostgreSQL** (local; laptop runs PG 18 on 5432) via Prisma — all data.
- **Python inference service** (FastAPI, port 8001): two ViT food models;
  Express proxies via `INFERENCE_URL`. (A faster-whisper speech model
  served voice search until both were removed in PRD v3.10.)
- **BigDataCloud reverse-geocode** (client-side fetch, place-name only) —
  the app's only runtime internet dependency besides model downloads.
- **SMTP** (optional; safe no-op when unconfigured).
- **Browser APIs**: getUserMedia (camera + mic), Geolocation,
  MediaRecorder, Web Audio analyser, BarcodeDetector (QR scan, Chrome-only).
- **No CI**: tests run manually via `npm test --workspace=server`.

### 1.3 Confirmed gaps and known issues (from audit, not assumptions)

1. **Photo EXIF is not stripped.** Uploaded photos are stored and served
   byte-for-byte as received (`grep` finds no EXIF/sharp handling). A phone
   photo can carry GPS coordinates in EXIF, which sits uneasily next to the
   app's "location stays on your device" story. *Verify, then decide.*
2. **Zero automated client tests.** All React behaviour (28 pages/components)
   is covered only by manual testing and the server suite's API contracts.
3. **Laptop inference-service startup is unconfirmed** since the 28 Oct
   port-8001 conflict (stale process held the port, service didn't answer).
   Sandbox is healthy; the demo machine is what matters.
4. **Recognition quality numbers are sandbox-only and tuned on the eval
   set itself** (temperature/threshold fitted on the same 55 photos that
   are reported). No held-out set, no target-laptop latency/RAM benchmark.
5. **Admin/NGO/recurring endpoint coverage is partial** (§1.1): several
   endpoints are exercised only indirectly or at the database level.
6. **Real SMTP delivery has never been exercised** (only stubbed/no-op).
7. **Two-device LAN mode has never been run end-to-end by the team.**
8. **Duplicate `postFood` key** in `i18n/strings.js` (later value wins —
   harmless but untidy; all three languages still balance at 194 keys).
9. **Polling never pauses** (Browse 30 s, notifications 15 s, hidden tabs
   included) — a known inefficiency, not a correctness bug.
10. **Demo assets are stale**: `docs/DEMO_SCRIPT.md` predates v3.3–v3.9.1
    and PR #1; the final PPT is still the frontend-era deck. (Presentation
    risk, tracked in Phase 5, not a code defect.)

### 1.4 Behaviour contracts to protect (changed by PR #1 — do not "fix" back)

- Wrong pickup code returns **400** (not 401) so the client never treats it
  as an expired token; lockout after 5 wrong attempts still applies (423).
- Duplicate registration returns **200 with a generic message** and no user
  object (anti-enumeration); success still returns 201 + auto-sign-in.
- Browse and listing detail are **public** (optionalAuth): anonymous users
  see listings and donor-set pickup coordinates, but **never** donor phone
  numbers (requires a signed-in viewer) — asserted by test QA-05.
- `cookedAt` cannot be in the future and deadline must be ≤ 24 h and in the
  future (validator refines) — verified present during this audit.

---

## 2. Module dependency map

```
M0 Environment & startup
 └─ M1 Foundation (app boot, DB, uploads, jobs)
     ├─ M2 Auth & accounts ───────────────┐
     │   └─ M3 Users & profile            │
     ├─ M4 Listings core                  │
     │   ├─ M5 Discovery (browse/public)  │
     │   ├─ M6 Claims & pickup codes      │
     │   │   ├─ M7 Expiry & notifications │
     │   │   ├─ M9 NGO redistribution ────┤ (needs verified NGO + collection)
     │   │   └─ M8 Dashboard & impact     │
     │   ├─ M11 Recurring (drafts feed M4)│
     │   └─ M12 Recognition (fills M4 form)│
     ├─ M10 Admin (acts on M2/M4/M9 data) │
     ├─ M13 Voice (searches M5)           │
     └─ M15 Email mirror (mirrors M7)     │
M14 Client shell & i18n — wraps every page above
M16 Two-device demo — exercises M1+M4+M6+M12+M13 on a second machine
```

Reading: a module may only be marked Verified when the modules it points
to are Verified. Anything that changes M2 (auth) or M4 (listings)
re-opens verification of everything to its right (Section 7).

---

## 3. Execution order (phases)

| Phase | Modules | Why here |
|-------|---------|----------|
| **0 — Demo machine first** | M0, M16 smoke | If the laptop can't boot the stack cleanly, nothing else matters on 3 Nov. |
| **1 — Core data path** | M1, M2, M3, M4 | Foundation → accounts → the listing lifecycle everything depends on. |
| **2 — Money path** | M5, M6, M7 | Discovery → claim → pickup → expiry: the exact demo storyline. |
| **3 — Roles & reporting** | M8, M9, M10, M11 | Dashboard truthfulness, NGO and admin workflows, recurring. |
| **4 — AI & client** | M12, M13, M14, M15 | Recognition and voice on the real laptop; full client manual matrix. |
| **5 — Final validation** | E2E journeys (§8), demo assets | Whole-system rehearsal on the frozen build. |

Within a phase: Critical tasks first, then High, then Medium/Low as time
allows. Never modify two interconnected modules in the same work session;
fix → test that module → run its regression set → record → move on.

---

## 4. Per-module test & stabilization checklists

Legend: **[A]** = covered by existing automated tests (run them; they must
stay green). **[N]** = proposed new automated test (to be written when the
module is worked on, after roadmap approval). **[M]** = manual test.
Every task lists: what to test → expected result → key failure scenarios.

### M0 — Environment & startup (Phase 0)

Existing automated tests: none (environment, not code).

- **M0-1 [M] Critical** — Cold start on the demo laptop via `start.bat`
  from a clean shell. → App on :4000, inference on :8001, `/health` shows
  `primary_loaded` and `specialist_loaded` both true. (Since PRD v3.10
  that is the complete expectation — voice search and its Whisper model
  were removed; a missing `whisper_loaded` field is correct, not a
  failure.)
  Failures: port 8001 already held (the 28 Oct incident — document the
  kill-owner procedure in the runbook), port 4000 held, PG not running.
- **M0-2 [M] Critical** — Restart resilience: reboot laptop, run
  `start.bat` again. → Everything returns without manual fixes; seed is
  idempotent (no duplicate demo accounts/listings).
- **M0-3 [M] High** — Fresh-clone path (the judge's-eye view): clone to a
  new folder, follow only the README. → App runs; note every undocumented
  step found. Failures: missing env values, model download stalls.
- **M0-4 [M] High** — One-time downloads present: the two ViT models
  cached; start with Wi-Fi off. → Full app works offline after boot.
- **M0-5 [M] Medium** — `server/.env` sanity: required secrets present,
  `DEV_RESET_LINK` understood (must be off/irrelevant on stage),
  `APP_BASE_URL` correct.

**Done when:** three consecutive cold starts on the laptop succeed end to
end with no manual intervention beyond `start.bat`.

### M1 — Foundation (Phase 1)

Existing: health.test.js (3) **[A]**.

- **M1-1 [A] Critical** — Health endpoint + schema tables exist; client
  build is served by the same server (no separate dev server needed).
- **M1-2 [M] High** — Photo serving regression: upload a photo, confirm it
  loads on Browse/detail/My Listings (the v3.5 uploads-path bug class).
- **M1-3 [N] High** — Job scheduler: with the server running, a listing
  whose deadline passes is expired by the 60 s job without any request.
  (Partially covered via direct `runExpiryPass` calls in expiry tests;
  the *scheduled* path itself is untested.)
- **M1-4 [M] Medium** — Security headers from PR #1 present
  (`X-Content-Type-Options`, `X-Frame-Options`, no `X-Powered-By`) and
  the app still loads in an iframe-free normal session.

**Done when:** health suite green + M1-2/M1-3 pass on the laptop build.

### M2 — Auth & accounts (Phase 1)

Existing: auth.test.js (6), v36.test.js (7), invite.test.js (7),
qa-fixes.test.js (rate-limit split) **[A]**.

- **M2-1 [A] Critical** — Register/login/refresh/logout cycle; bcrypt-only
  storage; tampered token → 401; logout revokes the refresh token
  server-side (PR #1 QA-13).
- **M2-2 [A] Critical** — Rate limits are per-bucket: exhausting login
  attempts must NOT block forgot/reset password (PR #1 QA-06 test), and
  the 429 message names the wait.
- **M2-3 [A] Critical** — Password reset: token is hashed, 30 min,
  single-use, new request invalidates the old one, reset revokes all
  sessions (v36 suite).
- **M2-4 [A] High** — Duplicate registration → 200 generic message, no
  user object, no second account (QA-15); success path still 201 +
  auto-sign-in.
- **M2-5 [A] High** — Invite attribution: valid code links `invitedById`,
  unknown code ignored (never an error), codes unique per user, lazy
  backfill via `/me`, `invitesCount` correct, public invite lookup
  reveals only validity + inviter name.
- **M2-6 [M] High** — Client session behaviour: log in, wait past the
  15-minute access-token expiry (or force it), perform an action. →
  Silent refresh succeeds (the v3.4.1 bug class); a genuinely dead
  session lands on login with a clear message, not a spinner.
- **M2-7 [N] Medium** — Suspended user: can log in and read history; every
  write returns 403 (currently asserted in p1 at API level for some
  routes — extend to listings/claims writes explicitly).
- **M2-8 [M] Medium** — Register validation messages are field-specific in
  all 3 languages (the v3.6 "Validation failed" bug class), incl. +91 /
  leading-0 mobile formats.

**Done when:** all four auth-related suites green + M2-6 passes on the
laptop in a real browser session.

### M3 — Users & profile (Phase 1)

Existing: contact.test.js (5), p1 language test **[A]**.

- **M3-1 [A] High** — Contact update: own number only, duplicates → 409,
  normalization (+91/spaces/leading 0) consistent with registration.
- **M3-2 [A] Medium** — Language preference persists per account and is
  applied after re-login on a different browser.
- **M3-3 [M] Medium** — Profile page shows the invite section with a
  working copy button and WhatsApp share link (PR #1); code shown matches
  the code `/me` returns.

**Done when:** contact suite green + M3-3 clicked through once on laptop.

### M4 — Listings core (Phase 1)

Existing: listings.test.js (9), coordinates.test.js (3),
qa-fixes.test.js (QA-19/20) **[A]**.

- **M4-1 [A] Critical** — Create validation: portions ≥ 1, deadline in
  future and ≤ 24 h, `cookedAt` not in future, category/portion enums,
  foodName ≤ 200 / foodDetails ≤ 2000 chars (QA-20).
- **M4-2 [A] Critical** — Safety checklist: 8/8 items required to publish;
  7/8 keeps the listing DRAFT and publish returns 422 naming the gap.
- **M4-3 [A] High** — Draft lifecycle (PR #1): edit a draft, publish a
  draft from My Listings, past-deadline draft publish → 409, stale LIVE
  listing edit → 409 (QA-19).
- **M4-4 [A] High** — Coordinates: both-or-neither, range-validated,
  never written into the address text; manual text edit clears the point.
- **M4-5 [A] High** — Photo upload: type checked by magic bytes, 5 MB cap
  → 413, stored file serves 200 with full bytes.
- **M4-6 [N] Critical** — **EXIF check (audit finding §1.3.1):** upload a
  phone photo known to contain GPS EXIF; download the served file and
  inspect its metadata. → Record the result in the Test Record. If GPS
  data is present, the team decides (strip on upload vs accept) *before*
  any fix is scheduled — this is a privacy-story issue for the pitch.
- **M4-7 [M] High** — Create-listing form end-to-end in the browser:
  camera capture and gallery upload both auto-fill and remain editable;
  Category=Other free text; Bulk Servings units; separate date + 12-hour
  time inputs; single agreement checkbox with terms popup.
- **M4-8 [A] Medium** — Cancel listing requires a reason, cascades claims
  to CANCELLED_BY_PROVIDER, and cannot be repeated.

**Done when:** listings + coordinates suites green, M4-6 recorded with a
team decision, M4-7 clicked through on the laptop.

### M5 — Discovery (Phase 2)

Existing: browse.test.js (6), qa-fixes.test.js (QA-05) **[A]**.

- **M5-1 [A] Critical** — Ordering: deadline ascending, created-at desc
  tiebreak; drafts/cancelled/expired never appear; `availableOnly=false`
  shows FULLY_CLAIMED but never EXPIRED/CANCELLED.
- **M5-2 [A] Critical** — **Public-access privacy (QA-05):** anonymous
  browse + detail return listings with NO donor contact; signed-in
  provider sees own contact; detail shows contact only with donor opt-in.
- **M5-3 [A] High** — Filters compose: category + dietary + portion type +
  NGO-suitable + ending-soon + text search (case-insensitive, name and
  details).
- **M5-4 [M] High** — Sold-out card treatment (v3.9): grey accent, "Fully
  claimed" label, View details (not "View & claim"); a card flips state
  on the 30 s refresh after its last portion is claimed elsewhere.
- **M5-5 [M] High** — Sort control: time / veg-first / non-veg-first /
  distance nearest & farthest; unknown distances always last; choosing
  distance without a GPS location explains itself and falls back
  (label behaviour per PR #1 QA-09).
- **M5-6 [M] Medium** — Priority badges: high ≤ 6 h / medium ≤ 24 h /
  expired / unknown — never colour alone (text label present), checked
  at boundary values.

**Done when:** browse suite green + M5-4/M5-5 verified in the browser on
desktop and phone widths.

### M6 — Claims & pickup codes (Phase 2)

Existing: claims.test.js (9) incl. both concurrency gates **[A]**.

- **M6-1 [A] Critical** — Portion accounting: partial claims decrement
  exactly; over-claim, 0/negative/fractional portions, own-listing claim,
  and expired-listing claim all rejected.
- **M6-2 [A] Critical** — Concurrency gates: 1 portion + 2 simultaneous
  claims → exactly 1 success; 50 parallel claims of 5 on 100 → exactly 20
  successes, remaining exactly 0, never negative.
- **M6-3 [A] Critical** — Pickup codes: 8 chars from the 32-symbol
  alphabet; no plaintext stored (hash + HMAC uniqueness + encrypted
  re-view copy only); owner re-view works while active; fields cleared
  at terminal state; admin cannot see codes.
- **M6-4 [A] Critical** — Verification: wrong code → **400** (contract,
  §1.4), claim status unchanged; 5 wrong attempts → 10-minute lock (423);
  correct code → COLLECTED; re-verify is idempotent with the original
  collected-at time; claimer attempting verify → 403.
- **M6-5 [A] High** — Cancellation rules: ≥ 30 min before deadline returns
  portions; < 30 min is CANCELLED_LATE and does not; repeat cancel → 409.
  Cancel is reachable from My Claims, Browse cards, and detail page.
- **M6-6 [M] High** — QR flow in the browser: claim success shows code +
  QR; provider scans with camera (BarcodeDetector) or types the code;
  copy-code button (PR #1) works.
- **M6-7 [M] Medium** — Claiming a listing that just sold out (stale
  screen) produces a clean error, not a broken page.

**Done when:** claims suite green (both gates passing) + M6-6 done once
with a real phone camera on the laptop build.

### M7 — Expiry & notifications (Phase 2)

Existing: expiry.test.js (4), v36 dismiss tests **[A]**.

- **M7-1 [A] Critical** — Expiry pass: past-deadline listing → EXPIRED,
  open claims expire with it, pickup-code fields cleared, listing leaves
  Browse.
- **M7-2 [A] High** — Near-deadline alerts fire exactly once per threshold
  (60 min provider; 30 min provider + claimers/NGOs) across repeated
  passes; bodies use readable IST dates (PR #1 QA-07).
- **M7-3 [A] High** — Notification ownership: list/read/read-all/dismiss
  are owner-only (other user's id → 404); click-through navigates to the
  listing and marks read; unread badge count matches reality.
- **M7-4 [M] Medium** — Live behaviour: leave Browse + Notifications open;
  a claim placed from a second account appears without manual refresh
  (15 s poll), badge updates.
- **M7-5 [N] Low** — Polling pauses when the tab is hidden (only if the
  team decides the inefficiency is worth touching a verified module —
  default: leave as is).

**Done when:** expiry suite green + M7-4 observed once in the browser.

### M8 — Dashboard, impact, CSV, public wall (Phase 3)

Existing: dashboard.test.js (4), p2.test.js (3) **[A]**.

- **M8-1 [A] Critical** — Numbers are computed only from DB records: the
  seeded worked example returns exactly 180 listed / 50 claimed /
  30 collected / 60% / 0 expired; empty DB returns honest zeros.
- **M8-2 [A] High** — History includes collected AND cancelled records for
  both provider and claimer sides.
- **M8-3 [A] High** — CSV export figures match the dashboard exactly.
- **M8-4 [A] High** — Public endpoint returns aggregates only — no user
  data, works without auth.
- **M8-5 [M] Medium** — Cross-check by hand: perform a known set of
  actions in the UI (post 2, claim 1, collect 1, let 1 expire) and verify
  every dashboard number moves exactly as expected.

**Done when:** dashboard + p2 suites green + M8-5 hand-check recorded.

### M9 — NGO workflows (Phase 3)

Existing: p1.test.js FR-16/FR-17 (partial) **[A]**.

- **M9-1 [A] High** — Unverified NGO can claim and is labelled unverified;
  after admin verification the label clears; NGO profile required at
  registration.
- **M9-2 [A] High** — Redistribution log: total logged never exceeds
  collected portions; entries credited to the collecting NGO only.
- **M9-3 [N] Medium** — Log edit/delete rules: editable until end of day
  after collection; after that, PATCH/DELETE are rejected; another NGO
  cannot edit/delete my entries (endpoint-level tests are thin today).
- **M9-4 [M] Medium** — NGO panel in the browser: log a redistribution
  after a collection, edit it same-day, see totals update.

**Done when:** p1 NGO tests green + M9-3 tests added and passing (or the
gap explicitly accepted in the Test Record).

### M10 — Admin (Phase 3)

Existing: p1.test.js (partial) **[A]**.

- **M10-1 [A] Critical** — Non-admin gets 403 on every admin endpoint;
  admin stats respond.
- **M10-2 [A] High** — Suspend/unsuspend: suspended user's writes → 403,
  reads still work; both actions write audit rows.
- **M10-3 [A] High** — Listing removal with a reason: open claims become
  CANCELLED_BY_ADMIN; audit row written; removed listing vanishes from
  Browse but history remains truthful.
- **M10-4 [N] Medium** — Endpoint-level coverage for `GET /admin/users`
  (search), `GET /admin/ngo/pending`, `GET /admin/audit` (append-only:
  no endpoint can modify/delete audit rows), NGO unverify.
- **M10-5 [M] Medium** — Admin UI pass: search a user, verify the demo
  NGO, remove a spam listing, and read the audit trail back in the UI.

**Done when:** p1 admin tests green + M10-4 added or accepted as a gap.

### M11 — Recurring donations (Phase 3)

Existing: p1.test.js FR-18 (partial) **[A]**.

- **M11-1 [A] High** — A due schedule generates exactly ONE draft
  occurrence (never auto-published); provider completes portions +
  checklist manually; day-of-week respected (Asia/Kolkata).
- **M11-2 [N] Medium** — Schedule PATCH/DELETE endpoint tests: edit the
  generation time, deactivate, delete; a deleted schedule generates
  nothing; `generate-now` is idempotent within the same day.
- **M11-3 [M] Medium** — UI pass: create a weekly schedule, generate now,
  find the draft in My Listings, publish it.

**Done when:** p1 recurring tests green + M11-3 done once in the browser.

### M12 — AI food recognition (Phase 4)

Existing: recognition.test.js (8, inference transport stubbed) **[A]**;
one-off evaluation in `docs/RECOGNITION_EVAL.md` (sandbox).

- **M12-1 [A] Critical** — Endpoint contract: provider-only; non-image and
  > 5 MB rejected; inference down → honest 503 with NO fake suggestion;
  response shape (suggestion + alternatives + confidence) stable.
- **M12-2 [M] Critical** — Live on the laptop: photo of a supported dish
  (poha/dosa class) → sensible auto-fill within a few seconds; a
  non-food photo → "uncertain", never a confident wrong dish; unsupported
  dishes (idli/samosa/upma/misal) behave as documented — uncertain or
  visibly wrong-but-editable, never silently trusted.
- **M12-3 [N] High** — **Held-out evaluation:** ~40 NEW photos (not in the
  original 55), frozen T = 0.25 / threshold 0.50; record top-1/top-3 on
  the laptop. This replaces the tune-on-the-eval-set caveat with honest
  numbers for the deck.
- **M12-4 [M] High** — Laptop benchmark: cold model-load time, per-photo
  latency (mean/p95 over 20 photos), peak RAM — recorded into
  `docs/RECOGNITION_EVAL.md` as *laptop* figures (sandbox figures must
  never be quoted as laptop figures).
- **M12-5 [M] Medium** — Camera path: rear camera default, camera switcher
  works, tracks stop when leaving the page (no lingering camera light).

**Done when:** recognition suite green + M12-2/M12-4 recorded from the
actual demo laptop.

### M13 — Voice search (Phase 4)

Existing: speech.test.js (4, transport stubbed) **[A]**.

- **M13-1 [A] Critical** — Endpoint contract: auth required; audio
  passthrough with language hint (en/mr/hi only); no audio → 400;
  oversize → 413; Whisper down → honest 503; nothing stored on disk.
- **M13-2 [M] Critical** — Real mic on the laptop (localhost): say a food
  name in English, Marathi, and Hindi; pause; the transcript lands in the
  search box and results filter — no "Done" tap (v3.9 silence auto-stop).
- **M13-3 [M] High** — Failure etiquette: mic permission denied, complete
  silence, background noise only, and inference service stopped — each
  produces the compact dropdown message under the input, never a stuck
  panel or a phantom search.
- **M13-4 [M] High** — Panel hygiene (v3.9.1): panel exactly covers the
  input at desktop and ~390 px widths; cancel via ✕ and Escape; after
  cancel/finish the mic indicator in the OS/browser is OFF (no leaked
  stream); double-tapping the mic starts exactly one session.
- **M13-5 [M] Medium** — LAN second-device caveat: on the non-host laptop
  the mic needs the Chrome insecure-origin flag — confirm the error
  message shown without the flag is the helpful one.

**Done when:** speech suite green + M13-2 passes in all three languages
on the laptop.

### M14 — Client shell & i18n (Phase 4)

Existing: none automated. All **[M]** unless noted.

- **M14-1 [M] High** — Header reacts to login/logout with NO reload
  (PR #1 AuthContext); cross-tab login state syncs (storage event).
- **M14-2 [M] High** — Full click-through of every page in all THREE
  languages hunting for: untranslated keys, English fallbacks, layout
  breaks from long Marathi/Hindi strings, the duplicate-`postFood` label
  showing the intended text everywhere.
- **M14-3 [N] Medium** — Automated i18n guard: a small script/test that
  fails if the three language objects' key sets differ (today: 194 each,
  verified by hand during this audit).
- **M14-4 [M] High** — Responsive pass at ~390 px and ~1280 px: nav
  hamburger (PR #1), filter row, cards, voice panel, admin tables —
  nothing overlaps or scrolls sideways.
- **M14-5 [M] Medium** — Location prompt: first visit asks once; GPS
  choice stores place-name (+coords on-device only); dismissal is
  remembered; header shows the place with edit; form prefill works;
  denying permission degrades gracefully.
- **M14-6 [M] Medium** — Invite landing: opening `/?invite=CODE` shows the
  banner naming the inviter; an invalid code shows nothing (no error);
  registering from the banner attributes correctly (ties to M2-5).
- **M14-7 [M] Low** — Real 404 page renders for a mistyped URL with a
  working home link (PR #1).

**Done when:** M14-2 and M14-4 completed with findings recorded;
M14-3 in place or accepted as manual-only.

### M15 — Email mirror (Phase 4)

Existing: p2.test.js FR-24 **[A]**.

- **M15-1 [A] Medium** — No SMTP configured → sending is a safe no-op and
  in-app notifications still fire (current production behaviour).
- **M15-2 [M] Low** — Optional: configure a throwaway SMTP once and
  confirm one mirrored email arrives; if skipped, record as accepted
  gap (email is a mirror, never the source of truth).

**Done when:** p2 suite green; M15-2 done or formally skipped.

### M16 — Two-device demo mode (Phases 0 and 5)

- **M16-1 [M] Critical** — Host laptop + second laptop on one Wi-Fi (or
  phone hotspot): second device opens `http://<host-IP>:4000`, logs in
  as claimer, claims a listing the host posted; host verifies pickup.
- **M16-2 [M] High** — Windows Firewall prompt handled (Private network,
  allow Node) and documented in the runbook.
- **M16-3 [M] Medium** — Camera/GPS on the second device with the Chrome
  insecure-origin flag set for the host origin; without the flag, the
  app still browses/claims fine and errors are graceful.

**Done when:** M16-1 completed once, start to finish, by the team.

---

## 5. Regression testing plan

### 5.1 What exists today (keep green, always)

The vitest suite — **94 tests / 16 files**, run with
`npm test --workspace=server` against the real test database:

| File | Tests | Guards |
|------|-------|--------|
| health.test.js | 3 | M1 foundation |
| auth.test.js | 6 | M2 core auth |
| v36.test.js | 7 | M2 reset + M3/M7 fixes |
| invite.test.js | 7 | M2 invite attribution |
| qa-fixes.test.js | 8 | M2/M4/M5 PR #1 fixes |
| listings.test.js | 9 | M4 lifecycle + photo |
| coordinates.test.js | 3 | M4 coordinates |
| contact.test.js | 5 | M3 contact privacy |
| browse.test.js | 6 | M5 discovery rules |
| claims.test.js | 9 | M6 claims + concurrency gates |
| expiry.test.js | 4 | M7 expiry + notifications |
| dashboard.test.js | 4 | M8 impact truth |
| p1.test.js | 8 | M9/M10/M11 (partial) |
| p2.test.js | 3 | M8 CSV + M15 email mirror |
| recognition.test.js | 8 | M12 endpoint contract |
| speech.test.js | 4 | M13 endpoint contract |

### 5.2 Proposed new automated tests (written during module work, not now)

1. **M1-3** scheduled-job expiry (the cron path, not just the service call).
2. **M2-7** suspended-user write blocks across listings/claims routes.
3. **M9-3** redistribution log edit/delete window + ownership.
4. **M10-4** admin users search, pending-NGO list, audit read/append-only,
   NGO unverify.
5. **M11-2** recurring PATCH/DELETE + generate-now idempotency.
6. **M14-3** i18n key-set parity guard (EN/MR/HI identical key sets).
7. **M4-6** EXIF probe as a *test of current behaviour* first (records
   whether GPS survives upload); becomes a stripping test only if the
   team decides to strip.

Client-side unit/e2e tooling is deliberately **not** proposed: with days
(not weeks) available, the manual matrix in Section 4 plus the API suite
gives better coverage per hour. Revisit after the hackathon.

### 5.3 When to run what (change-impact matrix)

Rule zero: **the full suite runs before every push and before any module
is marked Verified.** For a quick inner loop while working on one module:

| If you changed… | Run at minimum |
|---|---|
| auth routes/service/middleware, validators/auth | auth, v36, invite, qa-fixes, p1 |
| listings routes/service/validators | listings, browse, coordinates, contact, claims, expiry |
| claims routes, pickupCodeService | claims, expiry, dashboard |
| expiryService, jobs, notifications | expiry, v36, claims, dashboard |
| dashboard/impact/CSV | dashboard, p2 |
| admin/ngo/recurring routes | p1 (+ new M9/M10/M11 tests once written) |
| recognition/speech (Express side) | recognition, speech |
| schema.prisma | **full suite** + db push on both databases |
| client only | build (`npm run build`) + the module's manual tasks |
| inference (Python) | recognition/speech suites + M12/M13 manual tasks |

---

## 6. Test record (single source of truth)

Execution results are recorded in **`docs/TESTING_RECORD.md`** (created
when Phase 0 starts) with one row per task ID from Section 4:

| Task | Module | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------|--------------|----------|--------|--------|-----------|
| M0-1 | Startup | Cold `start.bat` on laptop | All services up, both food models loaded | — | Not Tested | — |

Status values: **Not Tested / Passed / Failed / Needs Retesting /
Accepted Gap** (a deliberate team decision, with the reason in the Bug
column). A module's row block is signed off with the date and the suite
result (`94/94` style) at sign-off time.

Initial state, from verified facts at roadmap time (2026-10-30):
all **[A]** tasks = Passed (suite 94/94 on the merged tree, sandbox);
M12-2/M12-4, M0-1, M16-1 = Not Tested on the target laptop
(M13-2 void — feature removed in PRD v3.10);
M4-6 = Not Tested anywhere; M14 items = Not Tested as a formal pass.

---

## 7. Protecting verified modules

1. A **Verified** module's code is frozen: no opportunistic clean-ups,
   refactors, or "while I'm here" edits.
2. If a later fix must touch a Verified module or anything it depends on
   (per the map in Section 2), its status drops back to **Needs
   Retesting**, its Section 5.3 regression set runs, and it is
   re-verified before dependent work continues.
3. Contract changes (§1.4) require a team decision recorded in the Test
   Record — never a silent edit. The 400-vs-401 pickup-code history is
   the cautionary example: both directions were "correct" at different
   times; only the record keeps them from flip-flopping.
4. Fixes are made one module at a time, smallest change that addresses
   the recorded bug, with the failing test/manual step re-run first
   (reproduce → fix → re-verify → record).
5. Every push states which modules it touches; a push that touches a
   Verified module without its regression results in the Test Record
   does not ship.

---

## 8. Final end-to-end validation (Phase 5)

Run on the frozen build, on the demo laptop, timed, twice. Any failure
returns the affected module to Section 4 — no fixes outside the process.

- **E2E-1 The demo storyline:** provider posts cooked meals with a photo
  (camera + recognition auto-fill) → claimer finds it by voice search →
  claims 20 of 50 → NGO claims the rest → provider verifies both pickups
  by QR → NGO logs redistribution → dashboard and public wall reflect
  every number → admin reviews the audit trail.
- **E2E-2 The unhappy paths:** wrong pickup code ×5 (lock, wait, succeed)
  → listing expires mid-claim → claimer cancels late (portions NOT
  returned) → provider cancels a claimed listing (claims cascade) →
  suspended user tries to post (403) → password reset end-to-end.
- **E2E-3 The second device:** the full claim journey split across two
  laptops (M16), including scanning the QR from the other screen.
- **E2E-4 The languages:** E2E-1 repeated with the UI in Marathi, then
  Hindi, by the teammate who will demo in that language.
- **E2E-5 The invite loop:** admin shares invite link → new user lands,
  sees the banner, registers (attributed) → inviter's Profile count
  increments → new user posts their first listing.
- **E2E-6 Data consistency audit:** after E2E-1..5, hand-verify: listing
  portions add up (listed = claimed + remaining + expired), dashboard
  totals match the database, no notification references a deleted
  listing, no pickup-code material remains on terminal claims.

**Exit criteria for the whole roadmap:** all Critical and High tasks
Passed (or formally Accepted Gap), full suite green on the final build,
E2E-1..6 completed on the demo laptop, and the demo assets (script, deck,
backup recording) refreshed against the frozen build.

---

*Prepared 2026-10-30 from a full audit of the codebase at `d4eb611`.
Approval of this roadmap authorizes testing work only; fixes are proposed
per module, with their regression results, as they are found.*
