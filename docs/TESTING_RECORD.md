# Food Waste Saver — Testing Record

**Single source of truth for testing progress.** Companion to
`docs/TESTING_ROADMAP.md` (task definitions, expected behaviour, and
priorities live there; this file records what was actually executed,
where, and what happened).

**Baseline:** repo `main` at merge commit `d4eb611` (PRD v3.9.1 + PR #1).
**Status values:** Not Tested · In Progress · Passed · Failed ·
Needs Retesting · Accepted Gap (deliberate team decision, reason in the
last column). A result counts only for the environment named in its row —
sandbox results never certify the demo laptop (roadmap rule 10).

**Initial state (2026-10-30):** every task covered by the automated suite
is marked *Passed (automated, sandbox)* — the suite ran **94/94 green**
on the merged tree in the sandbox on 2026-10-30. All manual and
proposed-test tasks start as Not Tested.

---

## Phase 0 — Environment & demo machine

| Task | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------------|----------|--------|--------|-----------|
| M0-1 | Cold start on demo laptop via `start.bat` | App :4000 + inference :8001 up; `/health` shows all 3 models loaded | **Passed 2026-10-30 on the demo laptop.** HEAD `d4eb611` (already up to date); DB already in sync (invite columns present); seed OK; client build `index-s9GTegbH.js` — identical hash to the verified merged build; app health ok; inference health: primary/specialist/whisper all `true`, errors `{}`, load 9.36 s. Note: two stale python.exe processes (PIDs 5380, 12376) were found and killed by the pre-start taskkill — the cold-start procedure handled them; watch this in M0-2. | Passed | — |
| M0-2 | Reboot laptop, run `start.bat` again | Clean restart, seed idempotent | **Passed 2026-10-30 on the demo laptop.** Post-reboot start with NO taskkill/manual cleanup: DB already in sync, seed re-ran with the same 4 demo accounts (no duplicates), build hash identical (`index-s9GTegbH.js`), AI service started, server listening on :4000, jobs started. No port conflicts from the pre-reboot session. (Post-reboot `/health` curls not re-pasted; inference health for this identical build/procedure was verified in M0-1 — a one-line 8001 curl was requested to complete the file.) | Passed | — |
| M0-3 | Fresh clone + README only | App runs, no undocumented steps | — | Not Tested | — |
| M0-4 | Boot with Wi-Fi off (models cached) | Full app works offline | — | Not Tested | — |
| M0-5 | `server/.env` sanity on laptop | Secrets present; DEV_RESET_LINK understood | — | Not Tested | — |
| M16-1 | Two-laptop claim journey on one Wi-Fi | Post on host, claim on guest, verify on host | — | Not Tested | — |
| M16-2 | Windows Firewall prompt (Private, Node) | Allowed + documented in runbook | — | Not Tested | — |
| M16-3 | Camera/GPS on guest device (Chrome flag) | Work with flag; graceful without | — | Not Tested | — |
| M12-1 | Recognition endpoint contract suite | Provider-only, honest 503, shape stable | **BUG-02 fixed 2026-10-30**: contract now carries `outcome` (recognized / not_recognized) with the guessed name withheld when not_recognized; +2 contract tests, live 8-image matrix verified (sandbox, real models), full suite 97/97 | Passed (automated + live API, sandbox) | BUG-02 → fixed |
| M12-2 | Live recognition on demo laptop (supported + non-food + unsupported dishes) | Sensible auto-fill; non-food uncertain; unsupported never silently trusted | Steps issued 2026-10-30; awaiting laptop results | In Progress | — |
| M12-3 | Held-out eval: ~40 new photos, frozen T = 0.25 / threshold 0.50, on laptop | Honest top-1/top-3 recorded | — | Not Tested | — |
| M12-4 | Laptop benchmark: load time, latency, peak RAM | Recorded in RECOGNITION_EVAL.md as laptop figures | — | Not Tested | — |
| M12-5 | Camera path: rear default, switcher, tracks stop on exit | No lingering camera light | — | Not Tested | — |
| M13-1 | Speech endpoint contract suite | Auth required; honest 503; nothing stored | Suite green 2026-10-30 | Passed (automated, sandbox) | — |
| M13-2 | Real mic on laptop: EN + MR + HI food names, pause to auto-search | Transcript fills search, results filter, no Done tap | Steps issued 2026-10-30; awaiting laptop results | In Progress | — |
| M13-3 | Voice failure etiquette: denied / silence / noise / service down | Compact dropdown message; no stuck panel | — | Not Tested | — |
| M13-4 | Voice panel hygiene at desktop + ~390 px | Panel covers input exactly; ✕/Escape cancel; mic fully released | — | Not Tested | — |
| M13-5 | Voice on LAN guest device without Chrome flag | Helpful insecure-context message | — | Not Tested | — |

## Phase 1 — Core data path

| Task | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------------|----------|--------|--------|-----------|
| M1-1 | Health + schema + same-server client suite | Green | Suite green 2026-10-30 | Passed (automated, sandbox) | — |
| M1-2 | Upload photo → appears on Browse/detail/My Listings | Serves 200, full bytes | Covered by listings suite assertions (sandbox); browser click-through pending | Passed (automated, sandbox) | — |
| M1-3 | Scheduled 60 s job expires a listing unaided | Listing expires with no request | — | Not Tested | — |
| M1-4 | Security headers present, app loads normally | nosniff, SAMEORIGIN, no X-Powered-By | Header test in qa-fixes suite green | Passed (automated, sandbox) | — |
| M2-1 | Register/login/refresh/logout; tampered token | Tokens rotate; logout revokes server-side | Suite green 2026-10-30 | Passed (automated, sandbox) | — |
| M2-2 | Exhaust login budget → try forgot-password | Recovery still works; 429 names the wait | qa-fixes suite green | Passed (automated, sandbox) | — |
| M2-3 | Password reset full cycle | Hashed 30-min single-use token; sessions revoked | v36 suite green | Passed (automated, sandbox) | — |
| M2-4 | Duplicate registration | 200 generic, no user object, no 2nd account | Suite green 2026-10-30 | Passed (automated, sandbox) | — |
| M2-5 | Invite attribution + backfill + count + public lookup | Valid links, unknown ignored, counts correct | invite suite green | Passed (automated, sandbox) | — |
| M2-6 | Browser session past 15-min token expiry | Silent refresh; dead session → clean login | — | Not Tested | — |
| M2-7 | Suspended user writes (listings/claims) | All writes 403, reads fine | — | Not Tested | — |
| M2-8 | Registration validation messages, 3 languages, +91/0 formats | Field-specific, correct language | Partially asserted server-side (v36); UI pass pending | Not Tested | — |
| M3-1 | Contact update rules | Own number only; duplicates 409; normalized | contact suite green | Passed (automated, sandbox) | — |
| M3-2 | Language preference across browsers | Persists per account | p1 suite green | Passed (automated, sandbox) | — |
| M3-3 | Profile invite section: copy + WhatsApp share | Code matches `/me`; links work | — | Not Tested | — |
| M4-1 | Create-listing validation set | All invalid inputs 422 with reasons | listings + qa-fixes suites green | Passed (automated, sandbox) | — |
| M4-2 | Checklist 7/8 vs 8/8 publish | 7/8 stays DRAFT, 422 names the gap | listings suite green | Passed (automated, sandbox) | — |
| M4-3 | Draft edit/publish; stale publish/edit guards | 409s where specified | qa-fixes suite green | Passed (automated, sandbox) | — |
| M4-4 | Coordinates both-or-neither + validation | 422 on half/invalid; text stays clean | coordinates suite green | Passed (automated, sandbox) | — |
| M4-5 | Photo upload rules | Magic-byte type check; 5 MB → 413 | listings suite green | Passed (automated, sandbox) | — |
| M4-6 | EXIF probe: GPS phone photo → inspect served file | Result recorded; team decision follows | — | Not Tested | — |
| M4-7 | Create-listing form browser pass (camera, gallery, Other, bulk, time inputs, agreement) | All paths work, AI fill editable | — | Not Tested | — |
| M4-8 | Cancel listing with reason | Cascades claims; not repeatable | claims/listings suites green | Passed (automated, sandbox) | — |

## Phase 2 — Money path

| Task | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------------|----------|--------|--------|-----------|
| M5-1 | Browse ordering + status visibility rules | Deadline asc; no draft/cancelled/expired | browse suite green | Passed (automated, sandbox) | — |
| M5-2 | Anonymous browse/detail privacy (QA-05) | Listings visible; donor phone never exposed | qa-fixes suite green | Passed (automated, sandbox) | — |
| M5-3 | Combined filters + search | Exactly the matching sets | browse suite green; **BUG-01 fixed 2026-10-30** (query whitespace normalization) — new BUG-01 test + live matrix all pass, full suite 97/97 (sandbox) | Passed (automated + live API, sandbox) | BUG-01 → fixed |
| M5-4 | Sold-out card treatment + 30 s state flip | Grey card, View details, live update | — | Not Tested | — |
| M5-5 | Sort control incl. distance fallback behaviour | Correct orders; unknowns last; honest label | — | Not Tested | — |
| M5-6 | Priority badges at boundary values | Correct band + text label every time | priority.js logic unit-checked 2026-10-28 (sandbox); UI pass pending | Not Tested | — |
| M6-1 | Portion accounting + invalid claims | Exact decrements; all invalid rejected | claims suite green | Passed (automated, sandbox) | — |
| M6-2 | Concurrency gates (1-left duel; 50×5 on 100) | Exactly 1 / exactly 20 succeed; never negative | claims suite green | Passed (automated, sandbox) | — |
| M6-3 | Pickup-code storage + re-view + clearing | No plaintext; owner-only re-view; cleared at terminal | claims suite green | Passed (automated, sandbox) | — |
| M6-4 | Verify: wrong code 400, 5× lock 423, idempotent collect | As specified in roadmap §1.4 | claims suite green | Passed (automated, sandbox) | — |
| M6-5 | Cancel-claim timing rules from all 3 surfaces | ≥30 min returns portions; <30 min CANCELLED_LATE | API rules in claims suite green; UI surfaces pending | Passed (automated, sandbox) | — |
| M6-6 | QR + copy-code browser flow with a real phone camera | Scan or type collects successfully | — | Not Tested | — |
| M6-7 | Claim against just-sold-out listing (stale screen) | Clean error, no broken page | API 409 verified live 2026-10-29 (sandbox); UI pass pending | Not Tested | — |
| M7-1 | Expiry pass end state | EXPIRED, claims expired, codes cleared | expiry suite green | Passed (automated, sandbox) | — |
| M7-2 | Near-deadline alerts once per threshold, IST dates | No duplicates across passes | expiry suite green | Passed (automated, sandbox) | — |
| M7-3 | Notification ownership + click-through + badge | Owner-only; 404 for others; badge accurate | expiry + v36 suites green | Passed (automated, sandbox) | — |
| M7-4 | Live notification arrival (15 s poll, second account) | Appears without manual refresh | — | Not Tested | — |
| M7-5 | Polling pause on hidden tab (optional) | Team decision required before touching | — | Not Tested | — |

## Phase 3 — Roles & reporting

| Task | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------------|----------|--------|--------|-----------|
| M8-1 | Seeded worked example + empty DB | Exactly 180/50/30/60%/0; honest zeros | dashboard suite green | Passed (automated, sandbox) | — |
| M8-2 | History completeness both sides | Collected + cancelled present | dashboard suite green | Passed (automated, sandbox) | — |
| M8-3 | CSV export vs dashboard figures | Identical numbers | p2 suite green | Passed (automated, sandbox) | — |
| M8-4 | Public dashboard endpoint | Aggregates only, no user data, no auth | dashboard suite green | Passed (automated, sandbox) | — |
| M8-5 | Hand-check: known UI actions → dashboard deltas | Every number moves exactly as expected | — | Not Tested | — |
| M9-1 | NGO unverified claim + label; verified label clears | As specified | p1 suite green | Passed (automated, sandbox) | — |
| M9-2 | Redistribution cap + ownership of credit | Never exceeds collected; own NGO only | p1 suite green | Passed (automated, sandbox) | — |
| M9-3 | Log edit/delete window + cross-NGO protection | End-of-day rule; others' entries untouchable | — | Not Tested | — |
| M9-4 | NGO panel browser pass | Log + edit + totals update | — | Not Tested | — |
| M10-1 | Non-admin on admin endpoints | 403 everywhere | p1 suite green | Passed (automated, sandbox) | — |
| M10-2 | Suspend/unsuspend effects + audit rows | Writes 403 while suspended; audited | p1 suite green | Passed (automated, sandbox) | — |
| M10-3 | Admin listing removal cascade + audit | Claims CANCELLED_BY_ADMIN; row written | p1 suite green | Passed (automated, sandbox) | — |
| M10-4 | Admin list/audit endpoint-level tests | Search, pending list, append-only audit, unverify | — | Not Tested | — |
| M10-5 | Admin UI pass | Search, verify, remove, read audit in UI | — | Not Tested | — |
| M11-1 | Due schedule → exactly one DRAFT | Never auto-published; weekday respected | p1 suite green | Passed (automated, sandbox) | — |
| M11-2 | Schedule PATCH/DELETE + generate-now idempotency | Deleted generates nothing; same-day no dupes | — | Not Tested | — |
| M11-3 | Recurring UI pass | Create → generate → draft → publish | — | Not Tested | — |
| M15-1 | Email mirror with no SMTP | Safe no-op; in-app notifications fire | p2 suite green | Passed (automated, sandbox) | — |
| M15-2 | One real SMTP delivery (optional) | Mirrored email arrives | — | Not Tested | — |

## Phase 4 — Client shell

| Task | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------------|----------|--------|--------|-----------|
| M14-1 | Header login/logout reactivity + cross-tab sync | No reload needed; tabs agree | — | Not Tested | — |
| M14-2 | Every page × EN/MR/HI click-through | No untranslated keys or layout breaks | — | Not Tested | — |
| M14-3 | i18n key-parity guard (proposed test) | Suite fails if key sets diverge (194 each today) | Key counts verified equal by hand 2026-10-30 | Not Tested | — |
| M14-4 | Responsive pass ~390 px + ~1280 px | No overlap or sideways scroll anywhere | — | Not Tested | — |
| M14-5 | Location prompt lifecycle | Asks once; denial degrades; prefill works | — | Not Tested | — |
| M14-6 | Invite landing banner (valid + invalid code) | Names inviter; invalid shows nothing | — | Not Tested | — |
| M14-7 | Mistyped URL | Real 404 page with working home link | — | Not Tested | — |

## Phase 5 — Final end-to-end validation

| Task | Test / input | Expected | Actual | Status | Bug → fix |
|------|--------------|----------|--------|--------|-----------|
| E2E-1 | Demo storyline across all roles | Every step + number lands as scripted | — | Not Tested | — |
| E2E-2 | Unhappy paths journey | Locks, expiries, cascades, 403s all correct | — | Not Tested | — |
| E2E-3 | Full journey split across two laptops | Claim + QR verify across devices | — | Not Tested | — |
| E2E-4 | E2E-1 in Marathi, then Hindi | Full journey in both languages | — | Not Tested | — |
| E2E-5 | Invite loop end-to-end | Attributed signup; inviter count +1 | — | Not Tested | — |
| E2E-6 | Post-E2E data consistency audit | Portions, totals, codes, notifications all reconcile | — | Not Tested | — |

---

## Module sign-off log

| Module | Signed off (date) | Suite result at sign-off | Notes |
|--------|-------------------|--------------------------|-------|
| — | — | — | No module signed off yet. Sign-off requires all Critical/High tasks Passed and this record updated (roadmap §7). |

## Change & retest log

| Date | Change | Modules dropped to Needs Retesting | Regression result |
|------|--------|--------------------------------------|-------------------|
| 2026-10-30 | Record created at baseline `d4eb611` | — | Suite 94/94 (sandbox) at creation |
| 2026-10-30 | M0-1 executed on the demo laptop | — | Passed — see M0-1 row (all 3 AI models loaded, 9.36 s; build hash matches verified build) |
| 2026-10-30 | M0-2 executed on the demo laptop (reboot + start.bat, no cleanup) | — | Passed — clean restart, seed idempotent, identical build hash |
| 2026-10-30 | **BUG-01 reported + reproduced (sandbox API):** Browse search returns 0 hits for queries with leading/trailing or doubled whitespace (`" Misal Pav"`, `"Misal Pav "`, `"Misal  Pav"`); exact multi-word, lowercase, periods and apostrophes verified WORKING. Root cause: the query is used verbatim in a substring (ILIKE) match — no whitespace normalization anywhere in the chain; stored names are trimmed/single-spaced at creation. | M5 (M5-3) | Fix proposed (server-side q normalization + tests); awaiting approval |
| 2026-10-30 | **BUG-02 reported + reproduced (sandbox, real models via the live API):** non-food photos return food names — car→"Gulab Jamun" (4.0%), desk→"Phirni" (3.5%), dog→"Modak" (4.7%), all correctly flagged `uncertain:true` by the pipeline, yet `CreateListing.runDetect` auto-fills the name ignoring `uncertain`; the contract has no rejection state (`food_name` always populated). Confident-wrong cases also confirmed: idli→"Rasgulla" 50.4% (uncertain FALSE), samosa→"Pakora" 99.98% via specialist (uncertain FALSE). Supported dishes verified intact: dosa 96.7%, poha 95.2%. | M12 (M12-1; M12-2 non-food sub-case) | Fix proposed (contract `outcome` state + client rejection UI); awaiting approval |
| 2026-10-30 | **BUG-01 FIXED** (approved by user): `GET /api/listings` normalizes the query's whitespace (trim + collapse) server-side; stored names untouched. New browse test covers leading/trailing/doubled/tab whitespace, multi-word, and punctuation names. Live matrix re-run: all previously-failing shapes now match; exact/punctuation/control unchanged. | M5 | Suite 97/97; build OK. Laptop retest folds into M5-3/M13-2 (voice transcripts benefit automatically) |
| 2026-10-30 | **BUG-02 FIXED** (approved by user): recognition response gains `outcome`; when the pipeline flags uncertain, the API returns `not_recognized` with `food_name`/`category` null, and CreateListing shows the "Unable to identify food" panel (Upload another image / Capture again) instead of auto-filling. No model/threshold/calibration change. Live matrix re-run: all 4 non-food photos → not_recognized with no name; dosa/poha unchanged; idli/samosa remain confidently wrong exactly as documented (accepted model limitation, NOT fixed and not claimed fixed). +2 recognition contract tests; i18n 198 keys ×3. | M12 | Suite 97/97; build `index-BWcFaClM.js`. Laptop visual retest of the panel folds into M12-2 |
