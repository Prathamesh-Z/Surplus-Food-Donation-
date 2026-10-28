# Food Waste Saver — Surplus Food Donation

A full-stack web platform for surplus food redistribution, built for **Hackathon 2K26**
(Phaltan Education Society's College of Engineering, Phaltan — Team HA040).

Providers (messes, canteens, restaurants, event halls) publish surplus food with
portions, a text pickup location and a hard collection deadline, gated by an
8-item food-safety checklist. Claimers and NGOs browse listings ordered by
soonest deadline, claim exact portions in a transaction-safe way, and collect
against a cryptographically protected pickup code. Listings expire
automatically; messes can set up recurring donations; NGOs log where collected
food went onward, credited to them; and the impact dashboard is computed only
from real system records.

Full specification: [`docs/PRD.md`](docs/PRD.md) (PRD v3.2, HA040).

## Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite (served by the Express server in production) |
| Backend | Node.js + Express, Zod validation, JWT access tokens + hashed refresh sessions |
| Database | PostgreSQL + Prisma (row-locked claim transactions) |
| Pickup codes | Salted SHA-256 verification hash + AES-256-GCM encrypted re-view copy + HMAC uniqueness |
| Jobs | Scheduled expiry / notification job in the server process (`node-cron`) |
| Food recognition | Local Python inference service (`inference/`, port 8001): two Apache-2.0 Indian-food ViT classifiers (80 + 15 dishes), curated description map — see `inference/README.md` and `docs/RECOGNITION_EVAL.md` |
| Demo posture | **Single machine on localhost — no cloud dependency** (app :4000 + recognition :8001) |

## Quick start (local, one machine)

```bash
# 1. PostgreSQL — either a local install, or the bundled compose file:
docker compose up -d db            # or use your own local PostgreSQL

# 2. Configure
cp server/.env.example server/.env # edit DATABASE_URL and secrets

# 3. Install, migrate, seed (synthetic demo data)
npm install
npm run db:push --workspace=server
npm run db:seed --workspace=server

# 4. Build the client and run the single server
npm run build
npm run dev --workspace=server     # http://localhost:4000
```

### Seeded demo accounts (synthetic — for demonstration only)

| Role | Email | Password |
|---|---|---|
| Provider | provider@demo.local | DemoPass1 |
| Claimer | claimer@demo.local | DemoPass1 |
| NGO | ngo@demo.local | DemoPass1 |
| Admin | admin@demo.local | DemoPass1 |

## What is built (module map)

| Module | Scope | PRD |
|---|---|---|
| 1 | Monorepo scaffold, full Prisma schema, seed, health endpoint | §6–7 |
| 2 | Auth & roles: registration, JWT + refresh sessions, role middleware, rate limits | FR-01–03 |
| 3 | Listings CRUD, photo upload (5 MB), 8-item food-safety checklist gate | FR-04–06 |
| 4 | Discovery: browse ordered by deadline, search + filters | FR-07–08 |
| 5 | Claims (row-locked transactions), pickup codes, cancel windows, provider verification | FR-09–12 |
| 6 | Expiry job (60 s), near-deadline alerts, in-app notifications (15 s polling) | FR-13–14 |
| 7 | Impact dashboard (DB-only figures), history | FR-15, FR-22 |
| 8–11 | Admin + audit log, NGO verification, NGO redistribution log, recurring donations, Marathi UI | FR-16–21 |
| 12 | Impact CSV export, optional email mirror (SMTP) | FR-23–24 |
| v3.4 | Camera scanning with automatic detection, app-level location prompt (place name only, header display), donor contact profile + per-listing opt-in visibility | PRD v3.4 |
| v3.5 | Photos on listing cards (incl. fixing the /uploads static-dir mismatch that 404'd every photo), sort by time/dietary/distance, listing pickup coordinates + on-device Haversine distance | PRD v3.5 |

Explicitly out of scope (per PRD): payments, delivery/transport, maps/GPS,
native apps, in-app chat, ratings, SMS/WhatsApp as a primary channel.
(ML is in scope only as the v3.3 recognition feature above.)

## Tests

Acceptance tests from the PRD run against a real PostgreSQL test database:

```bash
npm test --workspace=server   # needs DATABASE_URL_TEST (see server/.env.example)
```

49 automated tests cover every FR's acceptance criteria, including the FR-09
concurrency gates (1 portion left / 2 simultaneous claims → exactly 1 success;
50 parallel claims of 5 against 100 portions → exactly 20 succeed, remaining
exactly 0) and the FR-15 worked example (180 listed / 50 claimed / 30
collected / 60% completion).

Email (FR-24) is a mirror only: set `SMTP_HOST` etc. in `server/.env` and
in-app notifications are also emailed. Without SMTP it is a safe no-op and
the in-app channel remains the source of truth.

### Troubleshooting

On a normal developer machine `npm install` is all you need. In restricted
sandboxes where npm's TLS resets during the Prisma engine download, install
with `npm install --ignore-scripts` and place the Prisma engines manually
under `node_modules/@prisma/engines/`, pointing `PRISMA_QUERY_ENGINE_LIBRARY`
and `PRISMA_SCHEMA_ENGINE_BINARY` at them.

## Team

Team HA040 — Prathamesh Zende, Sahil More, Tanvi Patil, Anushka Jamdar,
Bharati Vidyapeeth Deemed University, YMIM, Malkapur, Karad.
Theme: **Food** · Event: Hackathon 2K26, PESCOE Phaltan, 3–4 November 2026.
