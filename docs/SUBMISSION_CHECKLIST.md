# Submission Checklist — Hackathon 2K26 (HA040)

## Deliverables (per event rules)
- [ ] Project description (from `docs/PRD.md`, Section 1 + 3)
- [ ] Source code / implementation details — GitHub repo, **set to public**
      before submission if the portal/judges need access
- [ ] Demonstrable prototype — the running app on the demo laptop
      (`start.bat`, then http://localhost:4000)
- [ ] PPT in the event's provided format, **converted to PDF**, uploaded to
      the submission portal

## Day-before checks (2 Nov)
- [ ] Full demo rehearsed end-to-end at least twice, timed (script:
      `docs/DEMO_SCRIPT.md`)
- [ ] Backup recording + screenshots of every demo step saved
      (`docs/demo-backup/`)
- [ ] `npm install` done, database created, seed loaded; server starts clean
- [ ] Test suite green on the demo laptop: `npm test --workspace=server`
- [ ] Laptop charger, HDMI cable, phone hotspot as venue-Wi-Fi backup
      (the demo itself is localhost and does not need internet)
- [ ] Arrive by **9:00 AM** on 3 Nov (the event page lists both 9 AM and
      10 AM starts — plan for the earlier one)

## Honesty rules for the demo (from our PRD)
- Seeded/demo data is **synthetic** — say so when showing seeded figures.
- The impact dashboard counts only records in this system. No pilot, user,
  partnership or ML claims — none exist, and none are claimed.
- Environmental equivalents, if mentioned at all, must be labelled as
  estimates with their source. The dashboard itself shows no estimates.
- This reference build was prepared before the event; the submission build
  is the work produced in the 3–4 Nov window, per the event's compliance
  rules (original work; open-source libraries permitted; no pre-built
  complete solutions).
