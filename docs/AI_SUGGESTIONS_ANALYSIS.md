# Analysis of External AI Suggestions — 29 October 2026

*Three AI responses were reviewed (referred to below as A = the long prescriptive one with the Thu–Tue plan, B = the one with "Risks and edge cases" and an order-of-work, C = "Final Strategy for Hackathon 2K26" with the demo timeline and team split). Nothing here has been built; this is analysis only, per the team's instruction.*

## The headline

All three independently reach the **same conclusion we already had**: the build is deep enough; the remaining risk is presentation, demo reliability, and a few claims a sharp judge could puncture — not missing features. All three say freeze features within days (A: Sunday 1 Nov night; B: Saturday 31 Oct night; C: no date, P0/P1/P2 only) and spend the remaining time on the deck, rehearsal, and bulletproofing. None of them suggested a rewrite, a cloud service, or a new model — the brief's constraints were respected.

## Consensus (all three, or two of three with the third silent)

1. **Rebuild the PPT** in the event template around the four judging criteria: sourced problem, flow, architecture + claim-lifecycle diagrams, AI evaluation table with known gaps, trust/safety, feasibility/pilot plan, real screenshots (including Marathi UI), limits/roadmap, references with model licences.
2. **Rehearse a single 4–5 minute story** with 4 assigned roles and a 2–3 minute cut: hook stat → donor posts with camera AI → show the "uncertain" failure case on purpose → voice search → claim with code/QR → handover (wrong code, then right) → NGO verify + redistribution → impact moves → proof (tests/concurrency) → honest limits.
3. **Bulletproof the demo**: offline cold-boot test from `start.bat`, backup video + screenshots, pre-staged logged-in profiles and known-good dish photos, headset mic, own hotspot instead of venue Wi-Fi, second-laptop clean-clone test, plugged-in/performance mode.
4. **Run the laptop benchmark** (cold start, first vs warm latency for photo + voice, RAM with everything loaded) and put the demo laptop's own numbers/specs on the slide instead of sandbox figures.
5. **Own the AI methodology caveat before a judge does**: temperature + threshold were tuned on the same 55 photos reported; n is small (error bars roughly ±13–20 points). A and B both prescribe the same fix: shoot ~40 fresh photos this weekend (including idli/samosa/upma/misal), freeze the calibration, and report held-out numbers next to the tuned ones.
6. **Feasibility story**: UNEP Food Waste Index 2024 figure quoted precisely (India household waste ≈ 78 million tonnes/yr, ≈ 55 kg per person — say "household"); FSSAI surplus-food framework framed as "designed to produce the records the regulation asks for", never "compliant"; pilot presented strictly as a plan, ideally backed by 2–3 real conversations (canteen manager, caterer, NGO volunteer) quoted with permission.
7. **Prep the five judge questions**: who guarantees food safety; did you train the model; how do you stop fake NGOs; why not a WhatsApp group; what breaks at 10,000 users. Answer pattern: what's built / what's measured / what's roadmap. The scale answer is agreed: 15-second polling ≈ 670 req/s at 10k users → SSE/push later; on-device distance → PostGIS/coarse cells later; AI → worker queue later.
8. **Submission hygiene**: decide how judges open the private repo (public at submission / collaborator / ZIP), keep commit history intact.

## Feature ideas actually proposed (deduplicated)

| # | Idea | From | Our status / delta | Size & risk |
|---|------|------|--------------------|-------------|
| 1 | **Journey timeline per listing** — posted → claimed → collected (verified) → redistributed to X, read-only from existing data ("chain of custody" made visible) | A (its #1 pick) | Data all exists (claims, collection, FR-17 redistribution log); only a UI view is missing | Small, read-only, low risk |
| 2 | **Top-3 AI guesses as tappable chips** — tap an alternative to fill the form (top-3 is 66.7% vs 48.1% top-1) | A + B | API already returns ranked alternatives and the form shows them as text; making them one-tap-apply is the delta | UI-only, very small |
| 3 | **"Not in the AI" quick row** — one-tap manual templates for idli, samosa, upma, misal pav | B | Not present; pure client addition, no AI claim made | UI-only, very small |
| 4 | **Cooked-meal storage hint** — if cooked-at → deadline gap > 2 h for cooked meals, non-blocking amber hint "keep hot or chilled until handover" (WHO Five Keys) + "cooked Xh ago" on cards | B (A raises the same WHO point, suggests recording storage condition in the checklist) | Hint needs no schema change; A's fuller version (storage-condition attestation) touches the checklist/schema | UI-only version: small. Schema version: medium — avoid |
| 5 | **Rescue Priority view** — one explainable ranking combining time remaining, distance, portions, NGO suitability, with a "why" line per card | C (its only feature pick) | Mostly exists as separate sorts + priority badges; delta is the combined view + explanation line | Small, client-only |
| 6 | **"Expired uncollected" figure** on the impact dashboard — visibly measure failure too | B | Impact already computes expired portions in the worked model; surfacing it prominently is the delta | Very small |
| 7 | **Donor waste insights card** — listed vs collected vs expired by weekday/time slot ("from redistribution to prevention") | A (stretch) | Read-only aggregation over existing data; demo data must be labelled synthetic | Small-medium, read-only |
| 8 | **Demo-mode tooling** — one-command demo reset (seed times relative to now), preflight script (ports, DB, models, sample recognition + transcription, logins PASS/FAIL), status/readiness page | A + B | Seed already uses relative times but only seeds when empty; a true reset + preflight script do not exist | Small scripts, high demo value |
| 9 | **Pause notification polling when the tab is hidden** | A | Not present; few lines in the polling hooks | Tiny |
| 10 | **FSSAI registration number on NGO signup** | A | **Already have it** — NGO registration captures `registrationDetail`, and admin verification is manual. Zero work; just name it in the deck | None |
| 11 | **Per-claim cap for individuals** (NGOs exempt) against claim hoarding | A (build it) vs B (if absent, call it planned — don't build) | Not present today | Small server change + tests, inside the claim transaction |
| 12 | **EXIF stripping for uploaded photos** (re-encode via canvas before upload) | B | **Real catch**: gallery photos can carry GPS EXIF and the server stores the original file — this sits awkwardly next to our "location stays on the device" story for listing coordinates | Small client change; server-side strip is sturdier but touches upload path |

Explicitly advised **against** by all three: a third recognition model, voice-to-form posting, push notifications, PWA/service worker, route optimisation, predictive demand, cloud anything, dependency upgrades, UI redesign.

## Sharp catches worth verifying (not features)

- **Cooked-at validation (B)**: check whether `cookedAt` in the future, or a deadline before cooked-at, is actually rejected. Our deadline rules (future, ≤ 24 h) are enforced; the cooked-at relationship may not be. One validator line if missing.
- **Pickup-code space (B)**: B estimated ~650 billion for "~30 symbols". Our alphabet is exactly 32 symbols (A–Z minus O, digits minus 0 and 1), so the exact figure is 32⁸ ≈ **1.1 trillion** — use the exact number on the slide.
- **EXIF GPS** (idea 12 above) — the only genuinely new *risk* any of them found.
- **A/B/C all missed** that token refresh after 15 minutes is already fixed (v3.4.1) — B's "leave it idle 16+ minutes" check will pass; keep it in rehearsal anyway.
- B's "60-second expiry gap" worry is covered: claim/verify endpoints check state and deadline themselves; the job is a sweeper, not the only guard.

## Where they disagree

- **The one feature to add**: A picks the journey timeline (1); B picks the top-3 chips + not-in-AI row (2, 3); C picks Rescue Priority (5). Each treats the others' picks as optional.
- **Claim cap**: A says build it with tests; B says don't build, list it as planned.
- **Freeze date**: A says Sunday 1 Nov; B's plan freezes Saturday 31 Oct; C gives no date.
- Only C assigns demo roles to named team members (a guess — treat as a template, not a decision).
- Only A raises recording a storage-condition attestation; B's UI-only hint covers the same judge question with no schema risk.

## Bottom line for the team's decision

Nothing here contradicts our current plan; the three responses mostly convert our known gaps (deck, script, rehearsal, benchmark, backup video) into a dated checklist. If the team adds anything at all, the lowest-risk/highest-signal candidates are **2 + 3** (an afternoon of UI work that directly strengthens the AI/ML award story), **8** (preflight + reset scripts — not features, demo insurance), and **1** (the timeline, if a half-day is spare). Everything else is presentation work, which is where all three — and our own 84/100 assessment — say the remaining points are.
