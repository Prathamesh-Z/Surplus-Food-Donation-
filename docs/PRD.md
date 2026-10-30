# Product Requirements Document — Food Waste Saver (HA040)
## v3.1 — Complete Full-Stack Build Specification

**Supersedes:** v1.0 (limited to prior material), v2.0 (cloud-hosted variant) and v3.0. Where v3.1 differs, v3.1 governs. Changes in v3.1 (corrections only, no scope change): (1) the executive summary is rewritten to match FR-07 and FR-14 exactly — the platform is not real-time, is not location-aware, and has no matching engine; (2) pickup-code uniqueness is enforced by a database unique constraint on HMAC(code, server-side pepper), so no plaintext code is stored in any column (FR-11, Section 7). Key specifications carried from v3.0: demo posture is a single server on localhost with no cloud dependency; roles are Provider / Claimer / NGO / Admin as four distinct roles; pickup-code storage uses salted SHA-256 plus an AES-256-GCM encrypted re-view copy, with HMAC-based uniqueness; NGO redistribution log and recurring donations are requirements, not suggestions.

**Event:** Hackathon 2K26, organised by Phaltan Education Society's College of Engineering, Phaltan (autonomous), in association with Cummins India Foundation, Pune and Govind Milk & Milk Product. Modelled on the Smart India Hackathon vision. Central theme: "Explore • Create • Conquer". Software and hardware innovation tracks.
**Event window:** 3–4 November 2026, College of Engineering, Phaltan. Results declared the evening of 4 November 2026, followed by the prize distribution ceremony. **Arrive for 9:00 AM on Day 1** — the event page lists the Day 1 start inconsistently (9 AM in the header vs 10 AM in Important Dates); plan on the earlier time.
**Registration:** ₹1,200 per group (engineering students). Contact: coephackathon2k26@gmail.com.
**Team:** Prathamesh Zende, Sahil More, Tanvi Patil, Anushka Jamdar — Bharati Vidyapeeth Deemed University, Yashwantrao Mohite Institute of Management (YMIM), Malkapur, Karad. Registration ID HA040, Desk 1. Registered title: "Food Waste Management and Surplus Food Redistribution". Mentor recorded on team material: Prof. Dr. Ajim Shaikh (not a team member).
**Chosen theme (exactly one):** Food.
**Status language used throughout:** BUILT means evidenced per Section 11. Everything specified for the event build is PLANNED until that evidence exists. Targets are labelled targets. Demo data is labelled synthetic.

---

## 1. Executive summary

Food Waste Saver is a full-stack web platform that moves surplus edible food from messes, canteens, restaurants and event halls to individuals and NGOs before a hard collection deadline: a provider publishes a listing with a text pickup location, portions remaining and a collection deadline, browse is ordered by soonest deadline first, and claimers and NGOs discover food through that browse order, search and filters — the system collects no coordinates, computes no distances and offers no nearest-first sorting. Claims are portion-level and transaction-safe, gated on the provider side by a food-safety checklist, and collection is verified with a cryptographically protected pickup code; listings expire automatically, daily surplus producers can set up recurring donations, and an NGO can log where collected food went onward, credited to that NGO. Notifications are in-app only and reach the user interface by polling every 15 seconds, and a new-listing notification goes to all Claimer and NGO accounts; there is no matching or ranking of claimers for a listing. It matters because surplus food is a time, trust and coordination failure more than a supply failure, and it is positioned to win because every one of the four equally-weighted judging criteria is served by demonstrable system behaviour — innovation in the closed list-to-redistribution loop and recurring-donation engine, technical complexity in the concurrency-safe claim transaction and pickup-code cryptography, feasibility and impact in the checklist, deadline enforcement and a dashboard computed only from real system records, and presentation in a single rehearsed end-to-end demo spine that runs on one localhost server with no cloud dependency to fail in the venue.

## 2. Problem statement

Verified statistics only, scope stated for each:
- **Global, 2022, UNEP Food Waste Index Report 2024:** 1.05 billion tonnes of food were wasted globally in 2022. 19% of food available to consumers was wasted at retail, food service and household level. By sector: households 631 million tonnes, food service 290 million tonnes, retail 131 million tonnes.
- These are global figures. They are not India figures, not Maharashtra/Phaltan/Karad figures, and not measurements of this project. No local food-waste quantity is stated anywhere in this PRD, because the team holds no local measurement.
- Regulatory context, cited as context and not as a compliance certification: FSSAI, Food Safety and Standards (Recovery and Distribution of Surplus Food) Regulations, 2019 — distribution of surplus food in India is a regulated activity involving donor declarations and recipient organisations, which is why this specification includes a per-listing safety declaration, distinct NGO accounts, and admin verification.

The operational problem has four parts: (1) surplus food is usable for a short window and recipients cannot see it in time; (2) recipients cannot judge safety from an unstructured announcement because cooking time, storage and handling are not declared; (3) coordination fails — portions are over-promised, claims are not held or released in a defined way, and pickup is not verifiably handed over; (4) nothing is recorded, so a provider cannot show what was saved, and an NGO cannot show where food it collected went onward. This product addresses all four parts, in that order.

## 3. User personas

Personas are illustrative composites created for design purposes. They are not real users, not pilot participants, and not evidence of adoption.

**Persona 1 — Sunita Jadhav, 44, hostel mess manager, Karad (Provider).**
Runs a 300-student hostel mess. Cooked quantities are fixed in the morning; attendance varies, so 20–60 portions remain on most days, and the pattern repeats daily. Pain: she currently announces surplus informally, has no record of what was given away, and worries about being blamed if food is mishandled after it leaves her kitchen. Goal: post surplus in under a minute, once as a recurring schedule rather than typing it every day, hand it over against a verifiable code, and keep a record that the handover happened properly.

**Persona 2 — Anil Pawar, 36, coordinator, community food NGO, Satara district (NGO).**
Collects surplus for a community kitchen and two shelters. Pain: food offers arrive as scattered phone calls with no portion counts, no deadlines and no proof of collection; afterwards he cannot show donors or his own trustees how much food reached which shelter. Goal: see available food sorted by soonest deadline, claim exact portions for each shelter run, prove pickup with a code, and log onward distribution per destination so the NGO's record is complete and credited.

**Persona 3 — Kavita Mane, 24, postgraduate student living in a rented room near her college, Phaltan (Claimer, individual).**
Cooks irregularly around classes and has a tight food budget. Pain: paying full price for meals on days she cannot cook, with no reliable way to know about surplus available nearby before it is gone. Goal: check what is available, claim a small number of portions (typically 1–4), see the pickup code clearly on her phone, and collect within the stated deadline — in Marathi or English, whichever she opens first.

## 4. Users and roles + permission matrix

Four distinct roles. An account has exactly one primary role at registration; a user who both provides and claims registers two accounts or requests a role change from Admin (changing roles self-service is not in scope — see Section 13). NGO is a distinct role from Claimer, not a flag on Claimer. All permissions below are enforced server-side by role middleware on every protected route (FR-03); hiding a button in the UI is never the enforcement mechanism.

| Action | Provider | Claimer (individual) | NGO | Admin |
|---|---|---|---|---|
| Register / log in / manage own account | Yes | Yes | Yes | Yes (admin accounts are created by seed/an existing admin, not public registration) |
| Create a listing | Yes | No — 403 | No — 403 | No — 403 |
| Edit / cancel own listing | Yes, per FR-06 rules | No | No | Moderation only (remove, FR-20) |
| Confirm safety checklist on a listing | Yes, own listings | No | No | No |
| Browse / search / filter live listings | Yes (view only) | Yes | Yes | Yes |
| Claim portions | No — 403 | Yes | Yes | No — 403 |
| Cancel own claim | No (cancels at listing level, FR-06) | Yes, per FR-10 | Yes, per FR-10 | No |
| View own pickup code (re-view while claim active) | No — sees only that a code exists | Yes, own claims | Yes, own claims | No — codes are never shown to Admin |
| Enter pickup code to verify handover / mark collected | Yes, for claims on own listings | No | No | No |
| Create a recurring donation schedule | Yes | No | No | No |
| Log onward redistribution for a collected claim | No | No | Yes, own collected claims only | No (view only) |
| Receive in-app notifications | Yes (claims on own listings) | Yes | Yes | Yes (moderation alerts) |
| Verify / suspend user accounts | No | No | No | Yes |
| Moderate listings (remove with reason) | No | No | No | Yes |
| View platform dashboard and all impact aggregates | Own data only | Own data only | Own data only | Yes, all |
| View audit log | No | No | No | Yes |

Additional role rules:
- **NGO verification:** an NGO account registers with organisation name and registration detail (free text + optional document upload is excluded — see Section 13; verification in this version is Admin review of the registered details). Default before building (confirm before building — see flag in FR-16): an NGO may claim immediately, but is labelled "Unverified NGO" to providers until an Admin marks it Verified. A provider sees the label on every claim.
- **Caps:** no per-account portion cap is specified in this version. Over-claiming is controlled by portions remaining (FR-09) and Admin suspension, not by caps. This is a stated decision, not an omission.
- **Suspension:** a suspended account can log in and view its own history, but every write action returns 403 with a suspension message.

## 5. User journeys

### Happy paths
**J1 — Demo spine, Provider → Claimer (must run end-to-end first):**
Sunita (Provider) logs in → creates a listing: "Cooked Meals, 80 portions, veg, pickup: Hostel Mess Gate, Karad, deadline today 16:00", uploads a photo, confirms all 8 checklist items → listing is Live → Kavita (Claimer) opens browse on a second screen; the listing is first under deadline-first ordering, showing 80 portions remaining and time remaining → Kavita claims 4 portions → she immediately sees her 8-character pickup code → Sunita's dashboard shows a claim of 4 and remaining = 76 → Kavita arrives, reads out the code → Sunita enters it in the claim → status Collected, claimed/collected counts update → impact dashboard (both accounts and Admin) reflects +4 collected portions.

**J2 — NGO claim and onward redistribution:**
Anil (NGO) filters browse to NGO-suitable, ending-soon → claims 50 portions of a listing → collects with his code (Provider verifies) → in his NGO dashboard he opens the collected claim and logs redistribution: 30 portions to "Shelter A (name as entered by NGO)", 20 portions to "Community Kitchen (name as entered)" → NGO redistribution totals become 50 and never exceed the 50 collected → the log entries appear in his history and in the Admin aggregate count of redistributed portions.

**J3 — Recurring donation:**
Sunita creates a recurring schedule: template listing (Cooked Meals, veg, mess pickup text), default portions 40, days Mon–Sat, generation time 13:30, deadline offset +3 hours → at 13:30 the system creates a pending listing → Sunita gets an in-app notification, confirms the day's actual portions (she edits 40 → 55) and confirms the checklist → listing goes Live. No occurrence ever publishes without her checklist confirmation.

**J4 — Expiry save attempt:**
A listing is 25 minutes from deadline with 30 portions remaining → the 30-minute near-deadline notification has already been created for the provider and for claimers/NGOs (FR-14) → an NGO claims 30 → collection is verified at minute 20 before deadline → listing ends Fully Collected, not Expired.

### Edge and error journeys
**J5 — Rejected claim (over-claim and race):** Listing has 1 portion left. Two claimers submit claims of 1 at the same moment. Exactly one succeeds and sees a pickup code; the other sees "No portions remaining" and has no claim and no code. A claim of 0, a negative number, or more than remaining is rejected in the UI and again on the server, with no change to portions.
**J6 — Expired listing:** A listing passes its deadline uncollected → the expiry job moves it to Expired within 60 seconds → it disappears from browse → an open claim on it shows Expired and its pickup code no longer verifies ("This claim has expired").
**J7 — Double mark-collected:** Provider enters a correct code → Collected. Provider (or anyone) enters the same code again → the system responds that this claim is already collected, shows the original collection time, and does not create a second collection, does not change any dashboard count, and does not error.
**J8 — Cancellation:** Claimer cancels a claim 45 minutes before the deadline → portions return to the listing and it may become claimable again. Provider cancels a listing with two open claims → both claims show Cancelled by Provider, the claimers are notified in-app, and portions are not returned anywhere because the listing itself is closed.
**J9 — Wrong code and lockout:** Provider enters a wrong code 5 times for one claim → verification for that claim locks for 10 minutes with a visible lock message; the correct code also does not verify during the lock; after the lock, the correct code verifies.
**J10 — Checklist blocked publish:** Provider leaves 1 of 8 checklist items unchecked → Publish is refused in the UI and on direct API call, with the unchecked item named.

## 6. Functional requirements

Tiers: **P0** = demo spine, must work before any other tier is polished. **P1** = winning edge. **P2** = stretch. Cut order is P2 first, then P1, never P0 (Section 12). No requirement in this section contains an undecided detail: where a choice was needed, a default is stated in the requirement and flagged "confirm before building" — the default is buildable as written if the team does not change it.

### P0 — Demo spine

**FR-01 — Registration.**
User registers with: full name, email (unique), mobile (10-digit Indian format, unique), password (minimum 8 characters), and role = one of Provider, Claimer, NGO. NGO registration additionally requires organisation name. Public registration cannot create an Admin. Passwords are stored only as bcrypt hashes (cost factor 12). Validation is enforced server-side with Zod schemas; invalid fields return 422 with per-field messages.
Acceptance test: Register a Provider with a valid payload → 201, account can log in, and the database contains no plaintext password (the stored value is a bcrypt hash that verifies against the password). Registering again with the same email → 409. Password of 7 characters → 422. Role = Admin via the public endpoint → 422.

**FR-02 — Login, token sessions, logout.**
Login with email + password issues an access token (JWT, 15 minutes) and a refresh token (7 days) whose hash is stored in a Session row. Refresh exchanges a valid refresh token for a new access token. Logout revokes that session's refresh token. A request with an expired or tampered access token to any protected route returns 401.
Acceptance test: Log in → protected call succeeds. Tamper 1 character of the token → 401. Log out → the same refresh token then returns 401 on refresh. Advance past access-token expiry (or issue a 1-second test token) → protected call 401, refresh succeeds and the new access token works.

**FR-03 — Role enforcement, validation and rate limiting on every protected route.**
Every protected route declares its allowed roles; role middleware rejects other roles with 403 before any data changes. All request bodies are Zod-validated. Rate limits: authentication routes — maximum 10 requests per 15 minutes per IP; pickup-code verification route — maximum 5 failed attempts per claim per 10 minutes, then the claim's verification locks for 10 minutes (FR-12). Exceeding a limit returns 429.
Acceptance test: As a Claimer, POST /listings → 403 and the listing count is unchanged. The 11th login attempt from one IP within 15 minutes → 429. A malformed body on any POST → 422 and no record is created.

**FR-04 — Create listing.**
Provider creates a listing with: food name (title), food details (description), **category — exactly one of these enumerated values: `COOKED_MEALS`, `RAW_PRODUCE`, `BAKERY`, `DAIRY`, `PACKAGED_FOOD`, `BEVERAGES`, `OTHER`**, dietary type — one of `VEG`, `NON_VEG`, `VEGAN`, **portion type — one of `INDIVIDUAL_MEALS`, `BULK_SERVINGS`, `KILOGRAMS`, `LITRES`, `PACKETS`**, total portions (integer ≥ 1, expressed in the chosen portion type), **NGO-suitable flag** (boolean, set by the provider; guidance text shown: suitable for bulk collection and onward distribution), photo upload (optional; JPEG/PNG/WebP, max 5 MB, stored on the server's local uploads directory and served by the same server), **pickup location as text** (free text address/landmark — coordinates are not collected in this version; see FR-07), collection deadline (date-time, must be in the future and within 24 hours of creation — *default, confirm before building*), and cooked/prepared-at time (date-time, not in the future).
Acceptance test: Create with portions = 100, category = COOKED_MEALS, portion type = INDIVIDUAL_MEALS → listing is Live (after FR-05), portions_remaining = 100. Portions = 0 → 422. Deadline in the past → 422. Deadline 25 hours ahead → 422. Category value `SNACKS` (not enumerated) → 422. A 6 MB photo → 413/rejected with a size message; the listing can still be created with no photo.

**FR-05 — Food-safety checklist gate, items enumerated.**
A listing cannot move to Live until the provider confirms **all** of these 8 items for that listing:
1. The food was prepared in clean conditions with clean utensils and potable water.
2. The food has been stored at the condition I declared (covered and, where applicable, refrigerated/hot-held) since preparation.
3. The food has not been previously served, plated or partially consumed.
4. The cooked/prepared-at time I entered is accurate.
5. The food shows no sign of spoilage (off smell, discolouration, or contamination) at the time of listing.
6. The food will be handed over in clean, covered containers or packaging.
7. I understand the collection deadline is the last time this food should be collected, and I will not hand it over after that time.
8. I accept the surplus-food donor declaration: I am donating this food voluntarily for redistribution, consistent with the FSSAI surplus-food regulations context.
The confirmation is stored per listing (items confirmed + timestamp + provider). The checklist records the provider's declaration only; the system does not inspect food.
Acceptance test: Journey J10 — 7 of 8 confirmed → publish refused in UI and via direct API (422), listing stays Draft and does not appear in browse. 8 of 8 → Live. The stored record shows all 8 item IDs and a timestamp.

**FR-06 — Edit and cancel listing, defined effects.**
Before any claim exists on a listing, the provider may edit any FR-04 field; portions can be edited to any integer ≥ 1 and portions_remaining updates to match (no claims exist). After the first claim, the provider may not edit portions below the already-claimed total (an edit to a total < claimed returns 409) and may not edit the deadline to a time in the past. Provider may cancel a Live or Draft listing at any time with a mandatory reason (free text, minimum 3 characters): status → Cancelled, the listing leaves browse immediately, every open claim on it moves to Cancelled-by-Provider, affected claimers receive an in-app notification (FR-14), and no portions are returned or redistributed.
Acceptance test: Listing with claims totalling 30 → edit total portions to 20 → 409; edit to 150 → succeeds, portions_remaining = 120. Cancel with a reason → both open claimers see status Cancelled-by-Provider and a notification within one browse refresh (≤ 15 seconds polling interval), and the listing is absent from browse.

**FR-07 — Browse, ordering, and location handling.**
Browse shows every Live and Partially-Claimed listing (available-only is the default, FR-08) as cards showing: photo (or placeholder), food name, category, dietary type, NGO-suitable badge if set, portions remaining, **time remaining to deadline (updated at least every 30 seconds in the UI)**, pickup location text, provider display name, and deadline.
**Ordering rule (stated, final for this version): primary sort is collection deadline ascending (soonest deadline first); ties break by created-at descending (newest first).** No other default ordering exists.
**Location handling (stated, final for this version): pickup location is text only. The system collects no coordinates for listings or users, computes no distances, and offers no nearest-first sorting.** Discovery is by deadline, search and filters only.
Acceptance test: Seed (synthetic) 3 listings with deadlines in 120, 30 and 60 minutes → browse order is exactly 30, 60, 120. A listing whose deadline passes is removed by FR-13 and does not appear on the next browse load. Time remaining shown for a listing with a deadline 90 minutes ahead reads between 89 and 91 minutes.

**FR-08 — Search and filters.**
Search matches food name and food details text (case-insensitive substring). Filters, combinable (AND): category (multi-select from the FR-04 enumeration), dietary type, **NGO-suitable only** (toggle), portion type, **ending soon** (deadline within 60 minutes), and **available only** (portions_remaining > 0 — default ON; turning it off also shows Fully Claimed listings, clearly badged, but never Expired or Cancelled ones).
Acceptance test: With a seeded (synthetic) set of 10 listings of known attributes, filter category = BAKERY + ending soon → returns exactly the seeded bakery listings with deadlines ≤ 60 minutes (count asserted). Search string "rice" → returns exactly the seeded listings whose name/details contain "rice", case-insensitively. Available-only OFF → the 1 seeded Fully Claimed listing appears badged; the seeded Expired listing never appears under any filter combination.

**FR-09 — Portion-level claiming, transaction-safe.**
A Claimer or NGO claims an integer number of portions n, where 1 ≤ n ≤ portions_remaining. The claim is executed as a single PostgreSQL transaction: the listing row is locked (`SELECT … FOR UPDATE` via Prisma transaction), portions_remaining is re-read inside the lock, the claim is rejected if n > the re-read value, otherwise a Claim row is created and portions_remaining is decremented by n atomically. Portions_remaining can never go negative; the sum of portions in open + collected claims for a listing can never exceed total portions. A provider cannot claim their own listing (403). Claiming an Expired, Cancelled or Fully Claimed listing returns 409.
Acceptance tests:
- 100 remaining, claim 30 → succeeds, remaining = 70, claim status = Confirmed.
- 70 remaining, claim 71 → 409, remaining = 70, no Claim row created.
- Claim 0 → 422. Claim −5 → 422. Claim 2.5 → 422 (non-integer).
- **Simultaneity test:** 1 portion remaining; 2 claims of 1 submitted in parallel → exactly 1 returns success, exactly 1 returns 409, remaining = 0, exactly 1 Claim row exists.
- **Load test:** 50 parallel claims of 5 against 100 portions → exactly 20 succeed, total claimed = 100, remaining = 0, no negative values, claim count in the database = 20.
- Claim on an Expired listing → 409. Provider claiming own listing → 403.

**FR-10 — Claim cancellation, defined effects.**
The claimer/NGO who owns a Confirmed claim may cancel it. If cancellation happens **30 minutes or more before the collection deadline**, the claim's portions return to the listing's portions_remaining and the listing status is recomputed (e.g. Fully Claimed → Partially Claimed). If cancellation happens **less than 30 minutes before the deadline**, the claim closes as Cancelled-Late and its portions do **not** return (the food cannot realistically be re-claimed and collected in time — *this 30-minute rule is the stated default, confirm before building*). The provider is notified in-app in both cases (FR-14). A Collected claim cannot be cancelled.
Acceptance test: Listing at 100 total, claim 20 (remaining 80) at deadline −45 min, cancel → remaining = 100. New claim 20, cancel at deadline −10 min → remaining stays 80 and claim status = Cancelled-Late. Cancel a Collected claim → 409.

**FR-11 — Pickup code: format, uniqueness, protected storage, re-view.**
On a successful claim only, the system issues a pickup code with this exact format: **8 characters, uppercase letters and digits, excluding ambiguous characters 0, O, 1 and I (alphabet: A–Z minus O and I, plus digits 2–9)**. The code is **unique among all claims that are not yet in a terminal state** (Collected, Cancelled-On-Time, Cancelled-Late, Expired, Cancelled-by-Provider, Cancelled-by-Admin). Uniqueness is enforced without storing the code: the server computes **HMAC-SHA-256(code, server-side pepper)** — the pepper is a secret held only in the server environment, never in the database — and a **database unique constraint on that HMAC value** rejects any second active claim with the same code, because the same code always maps to the same HMAC. On the (rare) collision the server regenerates a new code, up to 5 attempts, before returning an error. **The HMAC value is cleared (set null) when the claim reaches any terminal state**, so the unique constraint applies only to active claims and a code becomes available for reuse after its claim closes. No plaintext code is stored in any column, at any time. Storage is otherwise twofold: (a) a **salted SHA-256 hash** (per-code random salt, stored alongside) used for all verification comparisons — the plaintext is never used for verification lookups; (b) an **AES-256-GCM encrypted copy** (key from server environment, IV and auth tag stored per claim) that exists only so the **code's owner (the claimer/NGO who holds the claim) can re-view the plaintext code in their own claim view while the claim is Confirmed**. The encrypted copy is deleted (set null) when the claim reaches any terminal state. Providers and Admins never see the plaintext code; the provider's verification flow accepts the code the claimer presents.
Acceptance test: Claim succeeds → owner opens the claim → the same 8-character code is shown again after a page reload and after logging out and back in. Code matches the format regex (8 chars, no 0/O/1/I). **No plaintext code exists in any column of the database row** — inspection of every column of the Claim row shows only the salted SHA-256 hash, the salt, the AES-256-GCM ciphertext with its IV and auth tag, and the HMAC value, none of which is the code. **Duplicate test:** with an active claim holding a code, attempting to insert a second active claim whose code is the same (by computing its HMAC and inserting, via the claim service's code-assignment path or a direct database insert in the test) is rejected by the unique constraint on the HMAC column, and exactly 1 active claim holds that HMAC. After the first claim reaches a terminal state, its HMAC column is null and the same code can be assigned to a new active claim without a constraint error. After the claim is Collected, the owner re-opens the claim → no code is shown, and the encrypted-copy field is null. A failed claim (409) issues no code.

**FR-12 — Pickup verification and mark-collected, actor and idempotency defined.**
**Actor: the Provider who owns the listing performs verification**, in the provider's view of that claim, by entering the code the claimer presents. Verification compares the entered code against the salted SHA-256 hash (FR-11). On the first correct entry: claim → Collected, collected-at timestamp set, the claim's portions count as collected in all dashboards, and the code's encrypted copy is deleted and its HMAC value is cleared (FR-11). **Idempotency:** entering the correct code (or opening the verify action) again for an already-Collected claim returns the already-collected state with the original collected-at time — no error, no second collection record, no change to any count. Wrong entries increment a per-claim failure counter; at 5 wrong entries verification locks for 10 minutes (see FR-03 and Journey J9), during which even the correct code returns a locked response.
Acceptance test: Correct code → Collected, collected portions for the listing increase by exactly the claim size once. Submit the same code again → response states already collected with the identical collected-at timestamp, and dashboard collected totals are unchanged. Wrong code 4 times → not locked; 5th wrong → locked; correct code during lock → locked response; after 10 minutes (or with the test clock advanced) the correct code verifies.

**FR-13 — Automated expiry job.**
A scheduled job in the server process runs **every 60 seconds**. On each run it: (a) moves every Live/Partially-Claimed/Fully-Claimed listing whose collection deadline has passed to Expired; (b) moves every Confirmed claim on such a listing to Expired; (c) deletes the encrypted pickup-code copy and clears the HMAC value for those claims (FR-11); (d) creates near-deadline notifications due in that minute (FR-14). Expired listings never appear in browse or search results (FR-07, FR-08). An Expired claim cannot be verified (FR-12 returns an expired response, not a success).
Acceptance test: Create a listing with a deadline 90 seconds in the future and an open claim on it → within 150 seconds, the listing is Expired, absent from the browse API, the claim shows Expired, and verifying its (previously correct) code returns the expired response. Job run count/timestamps are visible in the server log for the test period.

**FR-14 — In-app notifications, channel stated.**
**Channel: in-app notifications only in this version.** Notifications are server-persisted records shown in a notification centre in the UI with an unread count; the UI refreshes them by polling every 15 seconds (no external messaging service is used, consistent with the localhost, no-cloud demo posture). Notification events: (1) new listing published → all Claimer and NGO accounts receive a "new listing" notification (title + portions + deadline); (2) a claim is placed on a provider's listing → that provider; (3) claim cancelled / listing cancelled → the affected counterparty (FR-06, FR-10); (4) **near-deadline: at 60 minutes and again at 30 minutes before a listing's deadline, if portions remain** → the provider, plus claimers/NGOs are notified at the 30-minute mark; (5) claim collected → the claimer/NGO. Notifications are marked read individually or all at once; read state persists across sessions.
Acceptance test: Publish a listing → within 15 seconds a logged-in claimer's unread count increases by 1 and the notification names the listing. Place a claim → provider's count +1. Advance a listing to 30 minutes before its deadline with portions remaining → a near-deadline notification exists for the provider and for claimers. Mark all read → count = 0 after logout and login again.

**FR-15 — Impact dashboard, system records only.**
Dashboards are computed from database records at request time; no figure is typed in or stored as an editable total. Metrics shown (definitions fixed): **listings created** (count of Listing rows, all statuses, in the selected period), **portions listed** (sum of total portions), **portions claimed** (sum of portions in claims not in a cancelled state), **portions collected** (sum of portions in Collected claims), **completion rate = portions collected ÷ portions claimed** (shown as a percentage, 0% if claimed = 0), **expired listings** (count of listings in Expired status), and, for NGOs, **portions redistributed** (sum from FR-17). Views: Provider sees own figures; Claimer sees own claimed/collected; NGO sees own claimed/collected/redistributed; Admin sees platform totals and per-role breakdowns. Default period is the event-to-date (all records); a today / last-7-days selector is included (*default, confirm before building*).
Acceptance test: Run the seeded demo sequence (synthetic): 3 listings created (100 + 50 + 30 portions), claims of 30 and 20, one collection of 30 → Admin dashboard shows exactly: listings created 3, portions listed 180, portions claimed 50, portions collected 30, completion rate 60%, expired listings 0. Manually editing any number is impossible — no edit control exists, and the figures are re-derived on reload.

### P1 — Winning edge

**FR-16 — NGO verification by Admin.**
Admin sees a queue of NGO accounts with their registered details and current label (Unverified / Verified). Admin marks an NGO Verified or returns it to Unverified, with the action written to the audit log (FR-21). The Verified/Unverified label is shown to providers on the NGO's claims and to the NGO on its own dashboard. *Default stated in Section 4 (NGO may claim while Unverified, labelled as such) — confirm before building; if the team instead requires verification before any claiming, only this FR's default changes: claiming returns 403 for Unverified NGOs, and all other FRs are unaffected.*
Acceptance test: New NGO registers → label Unverified, visible on its test claim to the provider. Admin verifies → label changes to Verified within one refresh, and the audit log contains exactly one verification entry with the admin, NGO and timestamp.

**FR-17 — NGO redistribution log.**
After a claim reaches Collected, the owning NGO (and only that NGO) can add redistribution entries to that claim. Each entry records: destination name (free text, e.g. shelter or kitchen name), destination type — one of `SHELTER`, `COMMUNITY_KITCHEN`, `OLD_AGE_HOME`, `SCHOOL`, `INDIVIDUALS`, `OTHER` — portions redistributed (integer ≥ 1), date-time of redistribution (defaults to now, cannot be in the future), and optional notes. The sum of entries for a claim can never exceed that claim's collected portions; an entry that would exceed it is rejected (422) with the remaining un-logged quantity shown. Entries can be edited or deleted by the owning NGO **until the end of the calendar day after collection** (*default, confirm before building*), after which they are locked. Redistributed portions are credited to that NGO in its dashboard and in Admin aggregates (FR-15).
Acceptance test: Claim collected for 50 portions → log 30 to a SHELTER → succeeds, un-logged remainder = 20. Log 25 → 422 (exceeds remainder). Log 20 to a COMMUNITY_KITCHEN → succeeds, remainder = 0, NGO dashboard redistributed total = 50. A different NGO attempting to add an entry to this claim → 403. A Claimer (individual) attempting any redistribution entry → 403.

**FR-18 — Recurring donations for messes and canteens.**
A Provider creates a recurring schedule containing: a template of the FR-04 listing fields (except portions, which is confirmed per occurrence, and photo, which is reused from the template unless replaced), days of the week (at least 1), a generation time (local time), and a deadline offset in minutes from generation time (default 180 — *confirm before building*). The server job (same scheduler as FR-13, checked every 60 seconds) creates a Draft "occurrence" listing at the generation time on each selected day, pre-filled from the template, and notifies the provider in-app (FR-14). The occurrence goes Live only after the provider sets/confirms that day's portions and confirms the FR-05 checklist for that occurrence — a recurring schedule never bypasses the checklist. The provider may skip an occurrence (it is discarded, recorded as Skipped) or pause/resume/delete the schedule. A schedule with no action taken leaves the occurrence in Draft; drafts never appear in browse, and an unconfirmed draft is discarded when its would-be deadline passes.
Acceptance test: Schedule set for today at a generation time 2 minutes in the future, offset 180 → within 150 seconds a Draft occurrence exists and the provider has a notification. Confirm portions = 55 + checklist → Live with deadline = generation time + 180 minutes and portions = 55. Create a second schedule occurrence and take no action → it never appears in browse and is discarded after its deadline. Pause the schedule → no occurrence is generated on the next selected day.

**FR-19 — Marathi alongside English.**
Every user-facing string in the primary flows (registration, login, browse, listing detail, create listing, claim, my claims, pickup verification, notifications, redistribution log, dashboards) is externalised in language resource files for English (`en`) and Marathi (`mr`). A language toggle in the header switches the entire UI without reload and persists per user account (and in local storage for logged-out pages). Dates, numbers (portions, percentages) and the pickup code display are formatted identically in both languages except for translated labels — the code itself is never transliterated.
Acceptance test: Switch to Marathi on browse → open create-listing, claim and verify flows → all labels in those flows render from the `mr` resource (test: no English label strings from a defined checklist of 30 primary-flow labels appear). Reload and log in again → language is still Marathi. Switch back → English restores everywhere. The pickup code displayed in Marathi mode is character-identical to the code in English mode.

**FR-20 — Admin: dashboards, user management, listing moderation.**
Admin can: view the platform dashboard (FR-15 aggregates + counts of users by role, open claims, listings by status); search users by name/email/mobile and view role, status and claim/listing counts; suspend and unsuspend any non-admin account (FR-03 write-block behaviour applies, reason required for suspension, stored); view any listing and remove it for moderation (status → Removed-by-Admin with mandatory reason; open claims on it move to Cancelled-by-Admin and claimers are notified — same notification behaviour as FR-06); and perform FR-16 verification. Admin cannot view pickup codes (FR-11) and cannot edit impact figures (FR-15).
Acceptance test: Suspend a claimer with a reason → that claimer's next claim attempt returns 403 with a suspension message, while their history remains viewable to them. Remove a listing with 1 open claim and a reason → listing absent from browse within one refresh, the claim shows Cancelled-by-Admin, the claimer has a notification, and the audit log has the removal entry. Unsuspend → claiming works again.

**FR-21 — Audit log of admin actions.**
Every Admin action in FR-16 and FR-20 (verify, unverify, suspend, unsuspend, remove listing) writes exactly one append-only AuditLog row: admin user, action type, target type and ID, reason (where required), timestamp. No UI or API operation edits or deletes audit rows. Admin can list and filter the log by action type and by admin.
Acceptance test: Perform the 5 action types once each → the log contains exactly 5 new rows with correct action, target and timestamp. Attempt to delete a row via the API → no such operation exists (404) and the row count is unchanged. Filter by "SUSPEND" → only the suspension row is returned.

**FR-22 — Claim and listing history views.**
Each role has a history view listing its own past and current items with final statuses: Provider — my listings (all statuses) with per-listing claimed/collected totals; Claimer — my claims with statuses and collected-at times; NGO — my claims plus redistribution entries per claim (FR-17). History is read-only except for the actions the FRs define (cancel, log redistribution).
Acceptance test: After running Journeys J1, J5 and J8 in a test account, the history views show each item exactly once with the correct terminal status, and the per-listing totals in the provider history equal the dashboard figures in FR-15 for the same records.

### P2 — Stretch (build only when all P0 and P1 acceptance tests pass)

**FR-23 — Impact CSV export.**
Provider, NGO and Admin can export their FR-15 dashboard figures and underlying listing/claim rows for a selected period as a CSV file generated server-side from the same queries as the dashboard (no separate numbers).
Acceptance test: Export after the FR-15 seeded sequence → the CSV's collected-portions total equals the dashboard's 30, and the file contains one row per listing/claim in the period (row count asserted against the database).

**FR-24 — Email as a second notification channel.**
If an SMTP configuration is present in the server environment, the FR-14 events (new listing, claim placed, near-deadline at 30 minutes) also send an email to the same recipients. If SMTP is not configured, the system runs normally with in-app only and logs that email is disabled — email is never on the demo critical path.
Acceptance test: With a local test SMTP sink configured, publishing a listing produces exactly 1 captured email per claimer/NGO recipient. With SMTP configuration removed and the server restarted, publishing still succeeds and in-app notifications are created.

## 7. Data model

PostgreSQL, accessed via Prisma. Timestamps are stored in UTC and displayed in Asia/Kolkata. `status` fields are Prisma enums with exactly the values named in the FRs.

- **User:** id (UUID), name, email (unique), mobile (unique), password_hash (bcrypt), role (enum: PROVIDER / CLAIMER / NGO / ADMIN), language_pref (enum: EN / MR, default EN), suspended_flag (bool), suspension_reason (nullable), created_at, updated_at
- **NgoProfile:** user_id (FK, unique), organisation_name, registration_detail (text), verification_status (enum: UNVERIFIED / VERIFIED), verified_by (FK User, nullable), verified_at (nullable)
- **Session:** id, user_id (FK), refresh_token_hash, expires_at, revoked_flag, created_at
- **Listing:** id, provider_id (FK User), food_name, food_details, category (enum per FR-04), dietary_type (enum), portion_type (enum), total_portions (int), portions_remaining (int, ≥ 0, DB check constraint), ngo_suitable (bool), photo_path (nullable, local server path), pickup_location_text, cooked_at, collection_deadline, checklist_confirmed_items (JSONB array of the 8 item IDs), checklist_confirmed_at, status (enum: DRAFT / LIVE / PARTIALLY_CLAIMED / FULLY_CLAIMED / EXPIRED / CANCELLED / REMOVED_BY_ADMIN), cancel_reason (nullable), recurring_schedule_id (FK, nullable), created_at, updated_at
- **Claim:** id, listing_id (FK), claimer_id (FK User — Claimer or NGO), portions_claimed (int), status (enum: CONFIRMED / COLLECTED / CANCELLED_ON_TIME / CANCELLED_LATE / EXPIRED / CANCELLED_BY_PROVIDER / CANCELLED_BY_ADMIN), pickup_code_hash (nullable once terminal), pickup_code_salt, pickup_code_encrypted (nullable, AES-256-GCM ciphertext), pickup_code_iv, pickup_code_auth_tag, pickup_code_hmac (nullable, **unique** — HMAC-SHA-256 of the code keyed with the server-side pepper, present only while the claim is active and cleared to null at any terminal state; this column is what the unique constraint in FR-11 is enforced on), verify_fail_count (int, default 0), verify_locked_until (nullable), collected_at (nullable), created_at, updated_at
  - *Implementation note (buildable as written):* the unique constraint cannot be on the salted hash (the same code with different salts hashes differently), so FR-11's uniqueness is enforced on `pickup_code_hmac` instead: the same code always produces the same HMAC under the server-side pepper, so the database rejects a duplicate active code without any plaintext code being stored in any column. The pepper is never stored in the database. Verification still compares only via the salted hash, and re-view still decrypts only via the AES copy. No API response ever includes the HMAC, the hash, the salt, or the encrypted fields.
- **RecurringSchedule:** id, provider_id (FK), template_fields (JSONB of FR-04 fields), days_of_week (array of 0–6), generation_time_local (HH:MM), deadline_offset_minutes (int, default 180), active_flag (bool), created_at, updated_at
- **RedistributionLog:** id, claim_id (FK), ngo_id (FK User), destination_name, destination_type (enum per FR-17), portions (int), redistributed_at, notes (nullable), created_at, updated_at
- **Notification:** id, user_id (FK, recipient), event_type (enum), title, body, related_listing_id (nullable), related_claim_id (nullable), read_flag (bool), created_at
- **AuditLog:** id, admin_id (FK User), action (enum per FR-21), target_type, target_id, reason (nullable), created_at — append-only, no update/delete operations exist

Invariants enforced by transactions and DB constraints: Listing.portions_remaining ≥ 0; sum of portions in CONFIRMED + COLLECTED claims per listing ≤ total_portions; PickupCode uniqueness per FR-11 among non-terminal claims; RedistributionLog sum per claim ≤ that claim's collected portions (enforced in the service transaction that creates an entry).

## 8. Architecture

**Stack (decided — not open):**
- Frontend: **React + Vite** (the team's choice), React Router, i18next with `en` and `mr` resources (FR-19). The production React build is served as static files by the same Express server — one origin, one process to run.
- Backend: **Node.js + Express** (same language as the frontend), Zod validation, bcrypt, JWT access tokens + hashed refresh-token sessions, express-rate-limit for FR-03.
- Database: **PostgreSQL + Prisma** — relational data, real transactions for claim safety, Prisma migrations as the schema record.
- Pickup codes: salted **SHA-256** for verification comparison; **AES-256-GCM** encrypted copy (key in server environment variable) for owner re-view, deleted at terminal state; uniqueness among active claims enforced by a unique constraint on **HMAC-SHA-256(code, server-side pepper)**, cleared at terminal state, so no plaintext code is stored in any column (FR-11).
- Background jobs: a **scheduled expiry/notification job inside the server process** (`node-cron`, every 60 seconds) implementing FR-13, FR-14 near-deadline events, and FR-18 occurrence generation — no separate worker service.
- Photo storage: the server's local `uploads/` directory (multer), served under a static path — no cloud storage.
- **Demo posture: single server, demo on localhost, no cloud dependency.** PostgreSQL runs on the same machine (local installation or a local Docker container started before the demo); the React build, API, jobs and database are all on that one machine, so venue connectivity cannot break the demo.
- Team's recorded rationale for this stack: the same stack ran end-to-end in the team's earlier full-stack build with automated tests passing, making it the lowest-risk choice for a two-day rebuild window. This rationale is recorded as the team's statement; verification of *this* event build is governed only by Section 11.
- Only open-sourced libraries, APIs and frameworks are used, as permitted; all application code is the team's own (Section 14).

**Data flow — the claim path (the system's critical flow):**
React claim form → `POST /api/claims` (JWT auth → role middleware: CLAIMER/NGO → Zod validation) → claim service opens a Prisma transaction → `SELECT … FOR UPDATE` on the Listing row → re-checks status, deadline and portions_remaining inside the lock → creates the Claim, generates the pickup code (salted hash + HMAC + encrypted copy), decrements portions_remaining → commit → response returns the claim and the plaintext code to its owner (once, from the just-generated value) → notification rows are written for the provider → polling/UI refresh shows the claim on the provider's dashboard within 15 seconds.

**How simultaneity and persistence are enforced:** simultaneity is enforced by the row lock plus the in-transaction re-read (FR-09) — a second parallel claim blocks on the lock, then re-reads the already-decremented value and is rejected if it no longer fits; persistence is PostgreSQL itself (all state survives a server restart — acceptance-level consequence: restart the server mid-demo rehearsal and listings, claims and dashboard figures are unchanged, which is part of the Section 11 browser checks).

**Why each choice (one line each):** React + Vite — team-decided, fastest familiar frontend loop. Express — same language, the team's proven backend. PostgreSQL — portion claiming is an accounting problem; row locks and constraints are the correct tool, and a document store cannot enforce FR-09's invariants as directly. Prisma — the Section 7 model becomes typed, migrated code instead of hand-written SQL under time pressure. Localhost single server — removes venue network, hosting quotas and cold starts from the demo's failure list entirely. Salted hash + AES re-view copy — verification never depends on storing plaintext, while the owner-re-view requirement (a real usability need: a claimer who closed the tab must still be able to collect) is still met.

## 9. Differentiation

**Existing food-sharing activity (public positioning, stated at the level publicly known):**
- Volunteer redistribution networks (e.g. Robin Hood Army, Feeding India) move food through human coordination — phone calls, chats, volunteers — not through a self-serve software system with portion accounting, deadlines and verified handovers that a mess manager and an NGO both operate themselves.
- Commercial surplus apps (e.g. Too Good To Go, operating mainly outside India) sell discounted surplus bags from retailers to consumers — a payment marketplace with fixed bags, not free, portion-level claiming by verified redistribution organisations.
- Peer-sharing apps (e.g. Olio) focus on household/neighbour sharing of small items, without institutional providers, safety declarations, or NGO onward-distribution records.

**Other registered teams in this event's domain (from the registration list):**
- **HA103 FoodBridge (KBP College of Engineering, Satara)** — registered title "Smart Food Waste Management and Donation Platform": the closest same-concept team. No public specification is available for it, so the comparison is against its registered concept: a food-waste donation platform.
- **HA008 "Reduction of food wastage" (K.B. Joshi Institute of IT, Pune)** — a 2-member team with a generic registered title and no further public detail.
- Adjacent, not direct: HA070 HarvestGuard (post-harvest loss for farmers), HA038 AuraChain (dairy cold-chain monitoring), HA105 AgriStock (surplus crops to industry). These solve supply-chain problems, not last-mile surplus redistribution to people and NGOs.

**Exactly what is different in this specification, and why it matters:**
1. **Transaction-proven portion claiming (FR-09)** — the claim is an accounting operation with a published simultaneity test (1 left, 2 in parallel → exactly 1 succeeds), not a "request" button. Matters because over-promising food that no longer exists is the fastest way a real provider stops using a platform.
2. **Pickup codes designed as a security feature (FR-11/FR-12)** — salted-hash verification, encrypted owner re-view, single-active uniqueness, lockout, idempotent collection. Matters because the handover is the moment of liability; this makes it provable.
3. **Recurring donations (FR-18)** — daily/weekly surplus producers (the largest repeat source) are a first-class workflow with per-day human checklist confirmation, not a copy-paste chore. No same-domain registered title indicates this.
4. **NGO redistribution log (FR-17)** — the record does not end at collection; where the food went onward, in what quantity, credited to the NGO, is part of the product. Matters because NGOs live on exactly this evidence for their own stakeholders.
5. **Checklist + deadline enforcement as system rules (FR-05, FR-13)** — a listing cannot exist without the 8-item declaration, and it cannot outlive its deadline by even one job cycle. Matters because safety and freshness are enforced by the system, not trusted to memory.

## 10. Success metrics

**Event goals (measurable during the event; these are goals for the build, not claims of results):**
- 100% of P0 acceptance tests (FR-01 to FR-15) pass on the demo machine before the Day 2 feature freeze, evidenced per Section 11.
- The J1 demo spine runs end-to-end on localhost in under 3 minutes, twice in a row, with no manual database intervention.
- FR-09 simultaneity and load tests pass 20 consecutive runs with zero invariant violations.
- Zero P0 defects open at freeze; any P1 defect open at freeze has its FR's demo path removed rather than shown broken.
- The explanation PPT (separate deliverable) covers exactly the journeys that pass; no journey is presented that is not in the passing set.

**Pilot metrics (targets only — labelled targets, not results; measured only if a pilot happens after the event):**
- Target: 10 providers and 5 NGOs onboarded within 30 days of a pilot starting.
- Target: 1,000 portions listed and a completion rate (collected ÷ claimed) of at least 60% in the first pilot month, as computed by the FR-15 definitions.
- Target: recurring schedules account for at least 50% of listings by the end of the pilot month (the FR-18 hypothesis: repeat producers dominate surplus).
- No pilot, user number or partnership currently exists or is claimed.

## 11. Verification status

**BUILT vs PLANNED, stated plainly:**
- For the event build specified here: **PLANNED — not yet built.** The event build window (3–4 November 2026) has not started at the time this PRD is written (26 October 2026). No FR in Section 6 is claimed as verified for this build.
- Prior material: the team's earlier concept material and the team's stated earlier full-stack build experience (Section 8 rationale) are **reference and experience only**. They are not the event submission and are not presented as event work (Section 14).

**How "verified" will be evidenced for this build (the only definition of verified used here):**
- Each FR moves to verified only when (a) its acceptance test exists as an automated test (API tests for server behaviour; the FR-09 concurrency tests must be automated) **or** a scripted manual test where automation is impractical (e.g. FR-19 language checklist), (b) that test has been run against the demo machine's build and its result logged in a test log file in the repository (test name, FR number, date/time, pass/fail, run by whom — the tester is never the member who implemented that FR), and (c) for UI flows, a browser check of the same journey is recorded in the same log.
- A claim of "tests passing" without the log (names, counts, dates) does not meet this definition and will not be made in the PPT or to judges.
- Current counts, honestly: event-build automated tests written: 0. Event-build browser checks recorded: 0. Both counts exist to be filled during the window, in the log, as work proceeds.

## 12. Build order for the 3–4 November window

Arrive Day 1 for 9:00 AM (Section header). Work in pairs where possible; the integration gates are all-hands.

1. **Foundation:** initialise the monorepo (React client + Express server), PostgreSQL running locally, Prisma schema for Section 7 migrated, seed script creating synthetic demo accounts (1 provider, 1 claimer, 1 NGO, 1 admin) — all seed data is synthetic. Gate: the server runs on localhost, the React build is served by it, and a health route responds.
2. **Auth and enforcement:** FR-01, FR-02, FR-03. Gate: their acceptance tests pass as automated tests.
3. **Listings:** FR-04, FR-05, FR-06. Gate: J10 works (checklist blocks publish) via browser check.
4. **Discovery:** FR-07, FR-08. Gate: ordering and filter counts verified against the synthetic seed.
5. **Claims — the critical block:** FR-09, FR-10. Gate: **both FR-09 concurrency tests (simultaneity and 50-parallel load) pass.** Nothing in P1 starts while this gate is red.
6. **Pickup and lifecycle:** FR-11, FR-12, FR-13. Gate: J5, J6 and J7 journeys pass; a server restart leaves all state intact.
7. **Notifications and dashboard:** FR-14, FR-15. Gate: the FR-15 seeded-sequence figures match exactly; **the J1 demo spine now runs end-to-end — P0 is complete.**
8. **P1, in this order:** FR-18 (recurring) → FR-17 (redistribution log) → FR-16 + FR-20 + FR-21 (NGO verification, admin, audit) → FR-22 (history) → FR-19 (Marathi — after all primary-flow strings are final, so translation is done once).
9. **P2 if and only if step 8 is fully green:** FR-23, FR-24.
10. **Freeze, rehearse, package:** feature freeze at a Day 2 time the team sets at the start of Day 1 (recommended default: 6 hours before the submission deadline — *confirm before building*); re-seed clean synthetic demo data; rehearse J1, J2 and J3 twice on the demo machine; restart the server once mid-rehearsal to prove persistence; produce the submission deliverables (project description, source code with README, demonstrable prototype on the demo machine, explanation PPT in the event format converted to PDF). This PRD is internal and is not submitted.

**Cut rule:** if time runs short, cut P2 entirely, then cut P1 in reverse order (FR-19 first, then FR-22, FR-20/21 extras, FR-16 — keeping FR-18 and FR-17 longest because they carry the differentiation in Section 9). **Never cut P0, never cut the FR-09 gate, never cut rehearsal (step 10).**

## 13. Deliberately NOT in scope

Each exclusion is explicit, with its reason:
- **Payments, charges, deposits** — surplus redistribution here is donation; payments would change the user base, add a payment-gateway dependency against the localhost posture, and serve no judging criterion for this entry.
- **Delivery / transport of food by the system** (including volunteer delivery roles) — collection is by the claimer/NGO at the pickup location. Transport logistics is a different product; adding it would put the P0 claim spine at risk in a 2-day window.
- **Machine-learning / AI model** — no training data is available to the team, and no requirement in this PRD needs one: ordering is deadline-based, and all rules are deterministic and testable. An ML claim without measured evidence would also breach this PRD's honesty rules. (This entry is therefore not competing on any AI-specific claim.)
- **Maps, GPS coordinates, distance calculation, nearest-first sorting** — decided in FR-07: pickup location is text. Coordinates add geocoding failure modes and venue-demo risk for no P0 benefit.
- **Native mobile apps, and public self-service role changes** — the responsive web app is the client; role changes go through Admin (Section 4).
- **In-app chat / messaging between provider and claimer** — coordination in this version happens through claims, notifications and the pickup code only; no FR specifies any additional contact channel between the parties. Chat is a moderation and scope burden disproportionate to a 2-day build.
- **Ratings and reviews** — trust in this version is carried by the checklist declaration, NGO verification labels, suspension and the audit/moderation system; ratings over a 2-day demo would be populated only by synthetic data and would add no real signal.
- **Document upload for NGO verification** — verification is Admin review of registered organisation details (FR-16); document handling adds file-security scope not needed for the event build.
- **External notification channels as the primary channel (SMS/WhatsApp)** — notifications are in-app (FR-14) by decision; email is P2 only (FR-24). This keeps the demo independent of external services.

Any item above moves into scope only under Section 15.

## 14. Compliance

- This PRD (v3.1) is the team's single build reference for the 3–4 November 2026 event window for HA040.
- All submissions are the team's original work. Use of open-source libraries, APIs and frameworks is permitted and is the basis of the Section 8 stack. **Use of a pre-built complete solution is strictly prohibited; the team works only during the hackathon period; plagiarism or unfair practices lead to immediate disqualification.**
- Prior code, prototypes, decks and the team's earlier build experience are **reference material only and are never presented as event work**. The event submission is the build produced in the event window under Section 12.
- Team rules: 2–4 members only (this team has 4); each participant in only one team; all members undergraduate/postgraduate students enrolled in a recognised educational institution; team composition cannot be changed after registration closure.
- Theme: exactly one — Food.
- Submission deliverables (produced separately; this PRD is not one of them): project description, source code / implementation details, a demonstrable prototype or output, and a PPT in the event's provided format converted to PDF before uploading to the submission portal.
- Submission integrity: the PPT and demo present only journeys whose tests pass per Section 11; demo data is synthetic and, if asked, is stated to be synthetic; targets are never stated as results.
- The intellectual property of the solution belongs to the team. Decisions of the organising committee are final.
- Prizes, as event facts (for the self-score context only, not as a claim or a promise): Engineering 1st prize ₹1,00,000, 2nd prize ₹51,000; total pool ₹1,76,000 including five ₹5,000 category awards (Best AI/ML, Innovation Excellence, Best Social Impact, Best Emerging Trend, Community Choice); all winners receive certificates.

## 15. How further features get added

1. A feature is added only on the team's own recorded words — never by assumption, suggestion, or because another team has it.
2. The addition is recorded as a new numbered version of this PRD (v3.2, v3.3, …) containing: the feature in one sentence, the tier (P0/P1/P2) with the reason for the tier, a new FR continuing the numbering, its data-model and permission-matrix changes if any, and a concrete acceptance test with numbers where applicable.
3. If the addition reverses a Section 13 exclusion, that exclusion is removed in the same version with the team's reason recorded.
4. The feature is PLANNED until it is verified under the Section 11 definition.
5. No version change is made during the Day 2 freeze except bug fixes to existing FRs (Section 12, step 10).

---

## Completeness check

- Zero undecided items remain inside any functional requirement in Section 6. Every detail that required a team choice has a stated, buildable default inside its FR.
- Items flagged "confirm before building" (each has a default that is buildable as written; confirming means accepting or replacing the default before its build block starts, not filling a blank):
  1. FR-04: collection deadline must be within 24 hours of creation — default as written.
  2. FR-10: the 30-minute late-cancellation threshold — default as written.
  3. FR-15: dashboard period selector (all-time default, today / last-7-days options) — default as written.
  4. FR-16 / Section 4: Unverified NGOs may claim, labelled as such — default as written; the alternative (block claiming until Verified) is fully specified in FR-16 if the team chooses it.
  5. FR-17: redistribution entries editable until the end of the calendar day after collection — default as written.
  6. FR-18: deadline offset default of 180 minutes from generation — default as written.
  7. Section 12: Day 2 freeze at 6 hours before the submission deadline — recommended default.
- Blocking decisions: **none.** Work can start at Build Order step 1 without any of the seven confirmations; each confirmation is due before its own build block, per the list above.
- All 14 mandated coverage areas are specified as requirements or, where the mandated item itself directs a choice, as the stated decision: roles + matrix (§4), authentication (§FR-01–03), listings + enumerated categories + enumerated checklist (FR-04, FR-05), discovery + deadline-first ordering + explicit text-location decision (FR-07, FR-08), transaction-safe claims + all rejection cases (FR-09, FR-10), pickup-code format/uniqueness/actor/idempotency (FR-11, FR-12), expiry (FR-13), both cancellations (FR-06, FR-10), notifications with channel stated (FR-14), NGO redistribution log (FR-17), recurring donations (FR-18), Marathi (FR-19), system-records impact dashboard (FR-15), admin + audit log (FR-20, FR-21).
- No pilot, user number, partnership or ML model is claimed anywhere in this document. The only statistics are the cited global UNEP figures in Section 2.

## Honest self-score (of this specification and plan, not of a finished product)

Scored against the four published judging criteria, equally weighted (25 points each). This is an assessment of the entry **as specified and as planned to be evidenced** — the product is not yet built, so every score below assumes the build and the Section 11 evidence actually happen; if they do not, the real scores will be lower. This score is not a prediction or promise of any rank, prize, or outcome.

| Criterion (25) | Score | Basis |
|---|---|---|
| Innovation and originality | 19 | The combination is genuinely differentiated in this field — transaction-safe portion accounting, security-designed pickup codes, recurring donations with a human checklist gate, and an NGO onward-redistribution log (§9). Held back because the core concept (surplus-food listing and claiming) itself is well-established, and a same-concept team (HA103) is registered. |
| Technical complexity and implementation | 21 | Row-locked claim transactions with load-level acceptance tests, salted-hash + AES-GCM pickup-code design, a 60-second lifecycle job, role-enforced API with rate limiting, and full persistence on a single server are real, demonstrable complexity for a 2-day build. Held back because there is deliberately no ML and no geospatial work (§13). |
| Feasibility and impact | 18 | Feasibility is high — a proven-language stack, localhost demo, deterministic rules, and impact measured only from system records (FR-15). Held back because impact at the event can only be shown on synthetic demo data; real-world impact is unproven until a pilot exists, and text-only locations limit real discovery compared to map-based products. |
| Presentation and demonstration | 17 | The J1 spine is short, scripted and runs without any external service, and the PPT rule (§11/§14 — present only passing journeys) protects credibility. Held back because presentation is the least de-risked part today: nothing is built or rehearsed yet, and the score depends entirely on protecting rehearsal time (Section 12, step 10). |
| **Total** | **75 / 100** | |

**What would raise it:**
- +Innovation: both FR-17 and FR-18 demonstrated live with the NGO persona journey (J2 + J3) in addition to the spine, instead of described.
- +Technical: the FR-09 load test (50 parallel claims) shown or its logged result presented as part of the demo, and the server-restart persistence check done live.
- +Feasibility & impact: the dashboard demo run on a fuller synthetic day-in-the-life dataset (a full recurring day across several providers, still labelled synthetic), making completion rate and expired counts meaningful numbers rather than single digits.
- +Presentation: two full rehearsals completed before freeze, the freeze actually held, and every number in the PPT traceable to a test-log entry (§11).

End of PRD v3.1.

---

## Amendment — PRD v3.2 (27 October 2026, team-directed)

The following changes were directed by the team after v3.1 and supersede the
named v3.1 decisions where they conflict. Everything else in v3.1 stands.

1. **AI-assisted listing (client-side only).** The create-listing form offers
   on-device food classification (TensorFlow.js + MobileNet, weights served
   by the app itself) from a photo. It only *suggests* the food name, details
   and category; the provider reviews and edits before publishing. No photo
   leaves the device for detection, and no server-side ML is claimed.
2. **Category "Other" note.** When category = OTHER, a free-text note states
   what it refers to (`Listing.categoryNote`), shown on cards and detail.
3. **Bulk sub-unit.** When portion type = BULK_SERVINGS, a sub-unit is
   recorded (`Listing.bulkUnit`: KILOGRAMS, LITRES, SERVINGS, TRAYS, BOXES)
   and the quantity label reflects it. Portion accounting is unchanged.
4. **Hindi added.** UI languages are now English (default), Marathi and
   Hindi (`LanguagePref` gains HI), with the same per-account persistence.
5. **"Use current location" assist.** The create form may fill the pickup
   location *text* from the browser's geolocation + reverse geocoding. Only
   the resulting text is stored — the v3.1 rule stands: no coordinates are
   stored, no distances are computed, ordering remains deadline-first.
6. **Checklist presentation.** The form presents one agreement checkbox with
   the full 8-item terms in a popup ("I Agree" confirms). The stored record
   remains the full per-item confirmation (`checklistConfirmedItems`), and
   the publish gate is unchanged: no agreement → DRAFT, never LIVE.
7. **12-hour split date/time entry** for cooked-at and deadline on the
   create form (separate date field + hour/minute/AM-PM). Validation rules
   are unchanged.

---

## Amendment v3.3 (2026-10-27, team-directed) — Indian food recognition replacement

Supersedes the v3.2 §1 on-device detector where they conflict.

1. **Recognition moves to a local Python inference service** (`inference/`,
   FastAPI, CPU) called by a new Express route `POST /api/listings/recognize`
   (PROVIDER-only; 5 MB cap; JPEG/PNG/WebP verified by magic bytes; the image
   is held in memory and never stored). The TensorFlow.js/MobileNet on-device
   detector is removed — root cause of inaccuracy: generic ImageNet has
   almost no Indian dishes, so most Indian food could never be predicted.
2. **Models** (both Apache-2.0, weights cached locally, loaded once):
   primary `dima806/indian_food_image_detection` (80 Indian dishes);
   specialist `therealcyberlord/vit-indian-food` (15 dishes incl. dosa, pav
   bhaji, vada pav, dhokla, chole bhature — absent from the primary).
   **FoodLens (Google Research) is a citation only**: no public weights,
   inference code or hosted API exist.
3. **Scores are never blended across models.** The specialist runs only when
   the primary top score < 0.60 and is returned in its own field. Below the
   calibrated uncertainty threshold (0.35, see `docs/RECOGNITION_EVAL.md`)
   the API flags `uncertain` and the UI asks for a clearer photo.
4. **Descriptions** come from a curated server-side map
   (`server/src/data/dishInfo.js`, ~92 labels incl. a category suggestion);
   they are reference content keyed by label, not facts read from the image.
   A label without an entry returns a fallback line, never invented detail.
5. **No fake fallback**: if the service or model is unavailable the route
   returns an explicit 503 and the UI offers retry/manual entry.
6. **Known coverage gaps, stated honestly**: idli, samosa, upma and misal pav
   are in neither model. `Amrrs/indian-foods` (5 classes incl. idli/samosa)
   was evaluated and deferred by team decision on 2026-10-27.

---

## Amendment v3.4 — Camera scanning, app-level location prompt, donor contact (28 Oct 2026)

User-directed feature round; all earlier rules remain in force except where amended here.

1. **Camera scanning + automatic detection (Create Listing).** Two ways to provide the food photo: **Upload Image** (file picker) or **Scan with Camera** (in-page `getUserMedia` preview; rear camera by default via `facingMode: environment`; a camera picker appears when multiple video devices exist; Capture renders the frame to a JPEG via canvas). Camera permission is requested only when the user opens the camera; all tracks stop on capture, cancel, and unmount. **Detection is automatic**: choosing or capturing an image immediately calls the unchanged `POST /api/listings/recognize` (v3.3 contract, models, thresholds); the separate "Detect Food" button is removed. A sequence token discards stale results when images change rapidly; error state offers retry; manual name entry/correction remains available at all times. Captured/uploaded images follow the existing rule: sent for recognition in memory only, and stored solely as the listing photo through the existing photo upload.
2. **App-level location prompt.** On first load with no saved location, a prompt offers **Use Current Location** (browser Geolocation → BigDataCloud place-name label, the same no-key service as the form) or manual place-name entry; dismissal is remembered on the device and the prompt does not repeat. The saved location shows in the header with an edit action at all times. Storage is the place-name **text only** in `localStorage` (`fws_location`) — coordinates are never stored, there is no background tracking, and — per the standing discovery rules — it does **not** filter, rank, or distance-sort listings; it prefills the posting form's pickup-location text (still editable per listing). The app remains fully usable when permission is denied.
3. **Donor contact management.** Registration already collects a required, validated 10-digit Indian mobile (`User.mobile`, unique) — unchanged. New: **Profile page** (`/profile`) showing account details and allowing the signed-in user to update their own number via `PATCH /api/users/me/contact` (same validation as registration; 409 when the number belongs to another account; identity comes from the auth token only). The posting form gains a **Donor Contact** section prefilled from the profile number (a per-listing override is allowed and does not alter the profile). `Listing.contactPhone` stores the number for that listing (defaulting server-side to the donor's saved mobile) and `Listing.showContact` records the donor's opt-in. **Privacy rule:** `contactPhone` is never spread into API responses; `donorContact` appears only (a) to the listing's provider, and (b) on the single-listing detail view when `showContact` is true. Browse/list responses never expose a number. Demo accounts are unaffected (seeded mobiles remain valid).
4. **Schema change:** two nullable/defaulted columns on `Listing` (`contactPhone`, `showContact`) — applied with `npm run db:push --workspace=server`, per the repository's existing workflow. No other schema changes; no new environment variables; no new dependencies.

**v3.4.1 fix (28 Oct 2026) — silent token refresh in the web client.** Access tokens expire after 15 minutes (FR-02) while the refresh token lasts 7 days, but the client never used the refresh endpoint, so any action taken after 15 minutes on an open page failed with "Invalid or expired token" (first hit on image recognition). `client/src/lib/api.js` now refreshes the access token once on a 401 and retries the request (`api()`, `recognizeFood()`, and the create-listing/photo uploads via a shared `authedFetch`). No server change.

---

## Amendment v3.5 — Listing photos on cards, advanced sorting, coordinates & distance (28 Oct 2026)

User-directed; this amendment REVISES the v3.1/v3.4 discovery rule. Pickup location is no longer text-only: listings may carry an exact pickup point, and claimers may sort by distance. Everything else in v3.1–v3.4 stands.

1. **Photos on cards.** Browse cards, My Listings and the detail page render the listing's stored photo (`photoPath`, uploaded through the existing post-create photo endpoint) at a consistent size with `object-fit: cover`; a clean placeholder shows when a listing has no photo or the image fails to load. No image data is stored in API responses beyond the existing path.
2. **Coordinates.** `Listing.pickupLat` / `Listing.pickupLng` (nullable Floats) store the pickup point, kept separate from the readable `pickupLocationText`. Both-or-neither, range-validated server-side (lat ±90, lng ±180). Capture flow: the posting form takes the point from the donor's saved app location (when it has coordinates) or the form's own "Use current location"; manually editing the address text clears the point so text and point can never silently disagree. Coordinates are never written into the address text, and no address is fabricated from coordinates. Legacy listings keep null coordinates.
3. **User location v2.** The app-level saved location (localStorage, this device only) additionally stores lat/lng when the user picks "Use current location"; manual entries have no coordinates. The user's own coordinates are never sent to the server and never exposed to other users — distances are computed on the claimer's device (Haversine). Only the listing's pickup point is public, as part of the listing itself.
4. **Sorting (Browse).** A visible Sort control offers: Time remaining lowest first (default — the standing deadline-ascending rule), Time remaining highest first, Vegetarian first, Non-vegetarian first (VEG and VEGAN both rank as vegetarian; dietary type is the donor-declared field, never inferred from AI recognition), Distance nearest first, Distance farthest first. Sorting runs client-side over the full filtered result set (the API returns all matches; there is no pagination), composes with search/category/dietary/availability filters, and needs no page reload. Listings with unknown distance sort last in both distance directions — never as nearest/farthest. When distance sorting is chosen without a saved user location point, the UI explains what to do and falls back to the deadline order. Distances display as metres under 1 km, else kilometres with one decimal.
5. **Schema change:** two nullable columns on `Listing` (`pickupLat`, `pickupLng`), applied with `npm run db:push --workspace=server`. Seed demo listings carry approximate Karad coordinates matching their synthetic labels. No new environment variables or dependencies.

---

# Amendment — PRD v3.6 (decided and BUILT 29 October 2026)

*Scope: fixes and completions from field testing — registration failures,
notification management, navigation separation, image framing, password
reset, and expiry-priority card indicators. Where this amendment and the
body or earlier amendments conflict, THIS amendment wins. Everything
below is BUILT and verified: 75/75 server tests pass (7 new in
`server/tests/v36.test.js`) and the client production build succeeds.*

## K. Registration "Validation failed" — root cause and fix

- **Root cause:** the API correctly returned field-specific errors
  (`details.fieldErrors`), but the Register page displayed only the
  generic top-level message — every slip looked identical and
  undiagnosable. Two input habits made failures common: mobiles typed as
  `+91 …`, with spaces, or with a leading 0; and NGO registrations
  submitting blank organisation strings.
- **Fixes:** the Register page now shows the field-specific reasons.
  Mobile input is **normalized** (spaces/hyphens stripped, `+91`/`91`
  prefix and leading `0` removed) by a shared `normalizeMobile` used by
  registration, the Profile contact endpoint, and the listing contact
  field; the stored value is always the clean 10 digits and the strict
  `/^[6-9]\d{9}$/` rule still applies after normalization. Blank NGO
  organisation strings are treated as "not provided", producing the
  specific NGO-required error when they are genuinely missing.
- Duplicate email/mobile still returns 409 with a clear message.

## L. Pickup verification, donor cancel, claimer cancel — verified, no redesign

- Live end-to-end re-verification (29 October) confirmed the existing
  implementations meet §3/§4 of the field-test brief: wrong code → 401
  "Incorrect pickup code" with no status change; five wrong attempts →
  10-minute lock (423); claimer cannot verify (403); correct code →
  COLLECTED; re-verification is idempotent (200 `alreadyCollected`).
  Claimer cancellation exists in My Claims with a confirmation dialog
  and the PRD's ≥30-minute portion-return rule; donor listing
  cancellation cascades to open claims (`CANCELLED_BY_PROVIDER`) and
  notifies claimers. These flows were working; the earlier reports are
  attributed to testing against pre-fix laptop builds.

## M. Notifications completed

- Existing: `Notification` model with `relatedListingId`/`relatedClaimId`,
  claim → exactly one `CLAIM_PLACED` notification to the listing owner,
  15-second polling, mark-read and mark-all-read.
- **Added:** `DELETE /api/notifications/:id` (owner-only, 404 otherwise)
  with a **Dismiss** action in the UI; **click-through** — opening a
  notification marks it read and navigates to the related listing (or My
  Claims); an **unread-count badge** on the Nav Notifications item,
  polled on the same 15-second cadence. Read/dismiss state persists in
  the database. Cancellation events already append their own
  notifications; history is never silently erased.

## N. Navigation separation and My Listings image framing

- Providers now have **two distinct Nav items**: "Post surplus food"
  (→ `/listings/new`) and "My Listings" (→ `/my-listings`); visibility
  remains role-gated to PROVIDER.
- My Listings card photos now use `object-fit: contain` on a neutral
  background at a fixed 180px height with the food name as alt text —
  the whole dish stays visible for portrait/landscape/square photos.
  Browse and Detail keep the intentional, consistent `cover` crop
  decided in v3.5.

## O. Password reset (new)

- `PasswordResetToken` model: only the **SHA-256 hash** of the token is
  stored; single-use (`usedAt`), **30-minute expiry**; a new request
  invalidates earlier unused tokens.
- `POST /api/auth/forgot-password` (rate-limited with the other auth
  routes) always returns the same generic message whether or not the
  email is registered. The reset link is delivered via the existing
  email service when SMTP is configured. `POST /api/auth/reset-password`
  validates the token, sets the new password with the same bcrypt cost
  as registration, consumes the token, and **revokes all of the user's
  sessions**.
- UI: "Forgot password?" on the Login page → `/forgot-password`;
  `/reset-password?token=…` page with new + confirm password (client
  match check + the same server-side field-error display as Register).
- **Env:** `APP_BASE_URL` (default `http://localhost:4000`) builds the
  link; SMTP variables as before. **Development-only:** when email is
  not configured and `DEV_RESET_LINK=true`, the forgot-password response
  includes the reset link so the flow can be tested locally. This flag
  defaults off and must never be enabled in production.

## P. Expiry-priority card indicators

- One central definition, `client/src/lib/priority.js`:
  **high ≤ 6h** remaining, **medium ≤ 24h**, **low > 24h**,
  **expired** (deadline passed), **unknown** (missing/invalid deadline —
  never shown as low priority). Thresholds live in
  `PRIORITY_THRESHOLDS` only.
- Browse cards, My Listings cards, and the listing detail show a
  text-labelled badge (🔴/🟡/🟢 + words — never colour alone) and a
  matching left-border accent, computed from the stored
  `collectionDeadline` at render, so a card's priority changes as time
  passes on the app's normal re-renders/polling. (Because FR-04 caps
  deadlines at 24 hours, "low" is rare in practice.)

## Q. What v3.6 does NOT change

Roles and permissions, pickup-code cryptography, claim transactions and
cancellation rules, the recognition service and its contract, and all
earlier acceptance gates stand unchanged. The sandbox `server/.env`
enables `DEV_RESET_LINK` for local testing only; the tracked
`.env.example` documents it as a placeholder that stays empty.

**End of PRD v3.6 amendment.**

---

# Amendment — PRD v3.7 (decided and BUILT 29 October 2026)

*Scope: two user-requested additions — voice search on Browse Food, and
Cancel Claim surfaced where claimers actually look for it. Client-only
changes; no schema, API, or rule changes. Client build verified.*

## R. Voice search on Browse Food

- A **🎤 Voice search** button sits beside the Browse search box
  (`client/src/components/VoiceSearchButton.jsx`), built on the Web
  Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). It
  renders **only when the browser supports it** — no dead controls.
- The recognition language follows the app's UI language
  (English → `en-IN`, Marathi → `mr-IN`, Hindi → `hi-IN`), so food names
  can be spoken in the language the app is being used in.
- The transcript fills the normal search box and runs the **same**
  server-side `q` search as typing — voice is an input method, not a
  separate search path. Listening state is shown on the button;
  failures show a short "please type instead" note; toggling the button
  or unmounting stops recognition. Requires a secure context like the
  camera does (localhost, HTTPS, or the Chrome flag from the
  two-device testing note).

## S. Cancel Claim — now in Browse and on the listing page

- Cancellation already existed in **My Claims** (verified live in v3.6)
  but claimers looked for it where they claimed. It is now also on:
  - **Browse Food cards** — a card for a listing the signed-in
    claimer/NGO has an active claim on shows "Your claim: N portions"
    with a **Cancel claim** button.
  - **The listing detail page** — an equivalent "Your claim" section
    under the claim form.
- All three places call the same existing endpoint
  (`POST /api/claims/:id/cancel`) with the same confirmation dialog and
  the same PRD rules (own claims only; ≥30 minutes before the deadline
  returns portions, later is `CANCELLED_LATE`). No backend change was
  needed or made; matching uses the `listingId` + `CONFIRMED` fields of
  `GET /api/claims/mine`, re-verified live.

**End of PRD v3.7 amendment.**

## v3.7.1 fix (29 October 2026) — voice search rebuilt, YouTube-style

Field report: "the voice search doesn't work." Diagnosis: the v3.7
button gave almost no visible feedback — listening state was only a
button-label change, and failures (mic blocked, insecure page) surfaced
as one small muted line under the filters. On a non-secure address
(second laptop via LAN IP without the Chrome flag) Chrome blocks the
microphone, so the feature appeared simply dead.

Rebuilt (`VoiceSearchButton.jsx`): the search bar now has a **round mic
button**; tapping it opens a **full-screen listening overlay** in the
style of YouTube's voice search — a large pulsing mic, "Listening…",
and the **live transcript** (interim results) as you speak. A final
result is shown briefly, then fills the search box and runs the normal
search. Errors are specific and shown inside the overlay with a
**Try again** button: microphone permission blocked (with the exact
address-bar fix), page not a secure context (with the localhost /
Chrome-flag fix), no speech heard, and no internet (Chrome's
recognizer is a cloud service). Recognition still follows the UI
language and still renders only where `SpeechRecognition` exists;
no other behavior changed. i18n: +8 keys ×3 (168 total).

**End of v3.7.1 fix note.**

---

# Amendment — PRD v3.8 (decided and BUILT 29 October 2026)

*Scope: voice search was failing in the field with Chrome's "network"
error despite a working internet connection. Root cause: the v3.7/v3.7.1
implementation relied on the browser's cloud SpeechRecognition, which
sends audio to the browser vendor's servers and fails on many real
networks (and unreliably for mr-IN/hi-IN). Fix: transcribe locally,
consistent with this app's no-cloud-dependency design rule.*

## T. Voice search — local Whisper transcription

- The Python inference service gains **`POST /transcribe`** and a
  **faster-whisper** model (`Systran/faster-whisper-small`, ~244 MB,
  CPU int8), loaded at startup alongside the food models and reported
  in `/health` as `whisper_loaded`. If it cannot load, `/transcribe`
  returns an honest 503 and food recognition is unaffected.
- Audio is decoded in `inference/speech.py` with PyAV directly to
  16 kHz mono — faster-whisper's own decode path passes kwargs newer
  PyAV versions reject (`metadata_errors`), which broke transcription
  outright; decoding ourselves removes that version sensitivity.
  Language hint: the UI language (`en`/`mr`/`hi`); auto-detect
  otherwise. Verified on a real speech sample (sandbox): exact
  transcript, ~3.1 s for an 11 s clip, model load ~7 s.
- Express gains **`POST /api/speech/transcribe`** (any signed-in role,
  multipart `audio`, 10 MB cap, in-memory only, nothing stored) which
  proxies to the service with the same honest-503 pattern as food
  recognition. The audio is the user's own voice clip, recorded by
  their own browser on their own action — it is never persisted or
  shared.
- Client: the YouTube-style overlay from v3.7.1 now **records** with
  MediaRecorder (tap mic → recording with timer → "Done — search it",
  auto-stop at 15 s), shows "Transcribing…", then commits the
  transcript to the search box. The browser cloud recognizer remains
  ONLY as a fallback when the local service answers 503 and the
  browser offers it. Mic permission / insecure-context guidance from
  v3.7.1 still applies.
- `start.bat` upgrades existing installs: if `faster_whisper` is
  missing it installs the requirements, and if the Whisper model is
  not cached it runs the model download — once, on the first v3.8 run
  (needs internet for that one download; afterwards fully offline).

**End of PRD v3.8 amendment.**

## v3.8.1 fix (29 October 2026) — start.bat parser hardening

Field report: after pulling v3.8, `start.bat` aborted with
"... was unexpected at this time". That is cmd.exe's parser rejecting
the script: the v3.8 upgrade block added parenthesised `if` blocks and
non-ASCII comment characters to a file stored with LF-only line
endings — a combination cmd.exe misparses (an earlier local edit on
the laptop removing brackets from an echo line was a symptom of the
same fragility). `start.bat` is rewritten defensively: linear
goto-label flow instead of parenthesised blocks, single-line
conditionals, plain ASCII text, CRLF line endings, and a new
`.gitattributes` (`*.bat text eol=crlf`) so checkouts keep CRLF.
Behavior is unchanged, including the v3.8 one-time speech package and
model fetch.

**End of v3.8.1 fix note.**

---

# Amendment — PRD v3.9 (decided and BUILT 29 October 2026)

*Scope: two UX fixes from field use — fully-claimed cards that still
looked urgent and claimable, and a voice search that needed a manual
"Done" tap. Client-only changes; no schema or API changes.*

## U. Fully-claimed Browse cards

- **Root cause:** the Browse API always knew the truth (a sold-out
  listing has status `FULLY_CLAIMED` and `portionsRemaining: 0`, and it
  is hidden by default unless the "available only" filter is off), but
  the card rendered every listing identically — priority-coloured
  border, urgency badge, and a "View & claim" button — with only a
  small red "Fully claimed" badge as a hint.
- **Fix:** a sold-out card (status `FULLY_CLAIMED` or zero portions)
  now gets a neutral grey accent, a slightly desaturated photo, no
  priority badge, a grey "Fully claimed" label (translated in all
  three languages), and a **View details** action instead of
  "View & claim". Expired and cancelled listings never reach Browse at
  all, so the four states stay distinct. The existing 30-second
  refresh updates a card's state in place when its last portions are
  claimed. Backend protection is unchanged and re-verified: claiming a
  sold-out listing returns 409, and the concurrency gates still hold.

## V. Voice search — automatic end-of-speech

- The mic button now sits **inside** the search input (right side,
  input text padded clear of it), in the style of Google Search.
- Recording ends **automatically**: a Web Audio analyser watches the
  microphone level, and after **1.8 s of silence** following actual
  speech the recording stops, transcribes locally (Whisper, as in
  v3.8), fills the search box, and runs the search — no confirmation
  tap. Tuning lives in three constants at the top of
  `VoiceSearchButton.jsx` (`SILENCE_MS`, `SILENCE_RMS`,
  `NO_SPEECH_STOP_MS`). A clip with no detected speech energy is never
  sent for transcription (the user gets "didn't hear anything"); a
  15-second hard cap remains, as do the pulsing overlay, the Cancel
  control, and tap-the-mic to finish early.
- Sessions are guarded by a session counter plus an active-session
  flag, so double-taps, retries, and late async results can't create
  duplicate searches; microphone tracks, the AudioContext, monitors
  and timers are all released on stop, cancel, and unmount. The
  browser-recognizer fallback (only when the local service is down)
  keeps its own built-in end-of-speech behaviour.

**End of PRD v3.9 amendment.**

---

# Amendment — PRD v3.9.1 (decided and BUILT 29 October 2026)

*Scope: the voice-search RECORDING UI only. Recording, silence
auto-stop, local Whisper transcription, and the browser fallback are
unchanged from v3.8/v3.9.*

- **Root cause of the broken UI:** the listening UI was a page-level
  modal — a `position: fixed; inset: 0` full-viewport overlay with a
  96 px pulsing circle and 30 px message text, launched from a button
  inside the search box. It covered the search bar and the whole page,
  visually disconnected speaking from the field it fills, and its
  oversized text wrapped/clipped badly at phone widths (worst on the
  long error messages). No CSS tweak fixes a wrong component shape.
- **Replacement:** the search box itself becomes the recording UI.
  Clicking the in-input mic swaps the input's own box for a compact
  panel of exactly the input's size (the component renders inside the
  `position: relative` search container; the input's vertical margins
  are zeroed so the panel's `inset: 0` matches the input box exactly):
  a small pulsing red mic dot (tap it to finish early), "Listening…"
  plus the elapsed time or the live interim transcript, a five-bar
  live level meter driven by the same Web Audio analyser that detects
  silence, and an obvious ✕ cancel. Transcribing and heard states show
  in the same footprint (green ✓ for heard); nothing on the page moves
  and nothing else is covered.
- **Errors** (permission denied, no speech, service down, insecure
  context) appear as a small dropdown card directly under the input —
  normal-size text, Retry and Close actions, ✕ to dismiss — instead of
  a full-screen takeover. Escape also cancels. All cleanup (tracks,
  AudioContext, timers, monitors, key listener) and the session guards
  from v3.9 are unchanged.

**End of PRD v3.9.1 amendment.**

---

# Amendment — PRD v3.9.2 (bug fixes, 30 October 2026)

*Two defects found in stabilization testing (see docs/TESTING_RECORD.md,
BUG-01 and BUG-02). No features added; no models, thresholds, or
calibration changed.*

## W. Browse search whitespace (BUG-01)

- Searching Browse with a query whose whitespace differed from the
  stored name (leading/trailing space, doubled spaces, tabs) returned
  zero results, because `q` was used verbatim in the substring match
  while stored names are validated trimmed and single-spaced.
- `GET /api/listings` now normalizes the incoming query only — trim and
  collapse whitespace runs to single spaces — before filtering. Stored
  names are never rewritten; punctuation and ordinary multi-word
  searches behaved correctly before and are unchanged.

## X. Recognition rejection state (BUG-02)

- The recognition response gains an explicit `outcome`:
  `recognized` or `not_recognized`, derived from the inference
  service's existing `uncertain` signal. When `not_recognized`, the
  response withholds the guessed name (`food_name: null`,
  `category: null`) — a low-confidence top-1 guess is no longer
  presentable as an identification.
- The Post Surplus Food page shows a dedicated "Unable to identify
  food" state in that case (with Upload another image / Capture again
  actions) and never auto-fills the form from such a result. The
  recognized path is unchanged.
- Stated limit, unchanged from v3.3's evaluation: an unsupported dish
  the specialist model is confidently wrong about (e.g. samosa) still
  returns `recognized` with a wrong name the user can edit. The models
  cannot reliably separate that case today, and this amendment does not
  pretend otherwise.

**End of PRD v3.9.2 amendment.**

---

# Amendment — PRD v3.10 (voice search removed, 30 October 2026)

*At the user's direction, the voice search feature (added in v3.7,
rebuilt in v3.7.1/v3.8/v3.9/v3.9.1) is REMOVED in full. Browse is a
text-search-only interface again. This amendment records a deletion,
not a new feature.*

## Y. What was removed

- Client: the microphone button and all recording UI on Browse
  (`components/VoiceSearchButton.jsx` deleted); Browse's search box is
  a plain text input. `transcribeVoice` removed from the client API
  library. The 16 voice-only i18n keys removed in all three languages
  (198 → 182 keys).
- Server: `POST /api/speech/transcribe` and its service deleted; the
  `/speech` mount removed. The endpoint now returns 404.
- Inference: `POST /transcribe` and the faster-whisper model deleted
  (`inference/speech.py` removed; `faster-whisper` dropped from
  requirements; the model is no longer downloaded). `/health` reports
  only the two food models — **the service is healthy when
  `primary_loaded` and `specialist_loaded` are both true**; there is
  no whisper field to expect.
- Startup: `start.bat` no longer fetches a speech package or model;
  fresh installs skip the ~250 MB Whisper download, and inference
  startup no longer spends time loading a speech model.

## Z. What is unchanged

- Text search on Browse, including the v3.9.2 whitespace-tolerant
  matching (multi-word and punctuation queries behave exactly as
  before; the removed input method does not change the query path).
- Food recognition (both ViT models, `/predict`, the v3.9.2
  `outcome` contract), camera capture, and photo upload.
- Offline operation: the app never depended on the network for voice —
  it now simply has one less local component.

**End of PRD v3.10 amendment.**

---

# Amendment — PRD v3.11 (manual food entry, 30 October 2026)

*Change 2 of the voice-removal + manual-entry request (Change 1 was
v3.10). Client-only: the recognition pipeline, its contract, and all
server behaviour are unchanged.*

## AA. Enter food details manually

- After a scan has filled the Post Surplus Food form, a distinct block
  under the result offers: **"Not happy with the scanned results? You
  can enter the food information yourself instead."** with an
  **Enter manually** action.
- Choosing it discards the scan completely: exactly the four fields
  recognition can write — food name, food details, category, category
  note — are reset to fresh-form defaults, and the result panel is
  dismissed so no stale suggestion remains visible. The photo,
  portions, deadline, pickup, contact and safety checklist are the
  user's own input and are never touched.
- In manual mode a note marks the state. Detection may still run when
  a new photo is added, but its result is held behind an explicit
  **Apply scanned result** action — typed details are never
  overwritten silently. **Use scanning** returns to automatic mode
  with a FRESH detection on the current photo; discarded values are
  never restored.
- Manual entry was always possible (every field is a plain input and
  no scan is required to post); this amendment makes the escape from a
  wrong scan explicit and one tap away. Existing validation is
  unchanged — name and details remain required, as before.

**End of PRD v3.11 amendment.**

---

# Amendment — PRD v3.12 (claimer pickup details + distance map, 30 October 2026)

*My Claims becomes the complete pickup-details view for a CONFIRMED
claim. The pickup-code and QR mechanism is exactly the one built
earlier (code issued at claim time, owner-only re-view endpoint, QR
encoding the same code, provider verify by scan or typed entry) —
this amendment adds contact, coordinates and a map around it, and
changes nothing about verification.*

## AB. Pickup details on CONFIRMED claims

- `GET /api/claims/mine` now also returns, per claim, the listing's
  `pickupLat`/`pickupLng` (already visible to anonymous browse users
  since PR #1 — no new exposure) and a gated `donorContact`.
- `donorContact` follows the listing-detail rule exactly: it carries
  the donor's phone ONLY when the claim is CONFIRMED and the donor
  opted in (`showContact`). A confirmed claim does not override the
  donor's choice; the raw `contactPhone` is never serialized, and no
  pickup code ever appears in this polling payload (the code stays
  behind the existing tap-to-reveal owner endpoint).
- The My Claims CONFIRMED card shows, in order: donor contact as a
  `tel:` link (when provided), pickup address, the existing code + QR
  block, and the distance map below. Cancelled, expired and collected
  cards render exactly as before.

## AC. Distance map

- New client component (`DistanceMap`) using Leaflet + OpenStreetMap
  tiles, dynamically imported so it loads only on My Claims. Labelled
  pins for the claimer's position and the pickup point, a dashed line
  between them, and bounds-fitted zoom.
- Distance is the existing on-device Haversine (`lib/distance.js`),
  displayed as e.g. "2.4 km away". The claimer's coordinates come from
  the app's saved location or a fresh Geolocation request and live
  only in component state — never sent to the server, never persisted
  by the component.
- Fallbacks: a listing without coordinates shows the address with a
  map-unavailable note (no invented position, no fake distance);
  denied/unavailable geolocation explains that the claimer's location
  is needed and leaves every other pickup detail usable; failed map
  tiles still draw markers and the route over a plain background with
  an explanatory note. The 15-second My Claims poll does not reset
  the map or re-request geolocation (the map effect depends only on
  coordinate values). The map is a distance visualization — it does
  not claim turn-by-turn navigation.

**End of PRD v3.12 amendment.**

---

## Amendment v3.13 (2026-10-30) — Live pickup tracking (straight-line only)

### §AD Live donor location sharing

- A donor may share their live location per confirmed claim (My Listings
  claim row → "Share live location"). Sharing is explicit opt-in per
  claim and is claim-scoped end to end.
- Storage: one `LiveLocation` row per claim (claimId is the key), so a
  publish overwrites the previous point — no location history exists.
  Columns: lat, lng (nullable), active, updatedAt.
- Endpoints (all authenticated; coordinates never appear in error
  bodies, list payloads or any public endpoint, and are never logged):
  - `POST /api/claims/:id/location` — only the claim's donor, only
    while the claim is CONFIRMED (409 otherwise); body validated as
    one coordinate pair (lat ±90, lng ±180; invalid → 422).
  - `DELETE /api/claims/:id/location` — the donor stops: the row is
    marked inactive and its coordinates are NULLED, so no last point
    lingers to be misread as current.
  - `GET /api/claims/:id/location` — only the claim's two participants
    (403 otherwise). Returns a computed state: `live` (point ≤60 s
    old), `stale` (older; the point is returned but labelled
    last-known), `stopped`, `waiting` (never shared), or `inactive`
    (claim no longer CONFIRMED — no coordinates in that response).
- The donor client publishes on ≥25 m of movement or a 20-second
  heartbeat (watchPosition; a single watcher per control; stopping or
  leaving the screen clears the watch immediately). After a refresh
  the control restores its state from the GET endpoint.
- The 60-second job purges LiveLocation rows whose claim is no longer
  CONFIRMED; the purge filter cannot match an active CONFIRMED claim.
- The claimer's coordinates are NEVER sent to the backend — no
  endpoint accepts them; the claimer side renders locally only.

### §AE Claimer live map

- DistanceMap polls the donor point every 10 s while a CONFIRMED
  claim card is mounted. Destination = the donor's live point while
  live; a STALE donor point is drawn grey with its last-update time;
  waiting/stopped fall back to the listing's static pickup
  coordinates, labelled as the pickup point.
- The claimer's marker follows watchPosition (updates throttled to
  ≥5 m). When the device reports a GPS heading, a rotating arrow on
  the claimer pin shows the travel direction; the map itself stays
  north-up (no simulated rotation), and a missing heading falls back
  to the plain pin.
- Distance is the Haversine straight-line distance to the current
  destination and is ALWAYS labelled "straight line" — no road
  distance or turn-by-turn navigation is claimed. OSRM road routing
  was evaluated and is DEFERRED until after the hackathon (decision
  2026-10-30) to keep the demo free of another external dependency.
- Network failure during polling shows a connection-lost note and the
  poll retries on its interval; contact, address, pickup code and QR
  remain available independently of live tracking.

---

## Amendment v3.14 (2026-10-30) — Password visibility toggle (batch F5)

- All password fields (Login, Register, Reset Password — both fields)
  use one shared `PasswordInput` component with an eye/eye-off toggle
  button inside the field. Passwords are hidden by default; the toggle
  switches the input between `password` and `text` types and nothing
  else — value handling, validation, autocomplete attributes and
  submission logic are unchanged.
- The toggle is a real button with a localized accessible label
  ("Show password" / "Hide password" in English, Marathi and Hindi),
  usable by keyboard and on touch devices.

---

## Amendment v3.15 (2026-10-30) — Claim-success popup (batch F6)

- After a successful claim on the listing detail page, a confirmation
  modal ("Claim Successful!") presents the claim: food name, portions
  claimed (from the claim response itself), pickup deadline (same
  locale formatting as the detail page), pickup address, the pickup
  code and QR via the existing PickupCodeDisplay, and the donor
  contact ONLY when the listing payload already carries it under the
  showContact rule — the modal introduces no new data exposure.
- Actions: "View My Claims" (navigates to My Claims) and "Done"
  (closes; Escape and backdrop click also close). The modal's primary
  action receives focus on open; it is a labelled dialog
  (role="dialog", aria-modal).
- The modal's visibility is state set exactly once in the claim
  success handler — it is not derived from polled data, so the page's
  15-second refresh and re-renders cannot reopen or duplicate it, and
  it never appears for a failed claim. The pre-existing inline success
  block remains behind it as the fallback. No claim, code, or
  verification behaviour changes.

