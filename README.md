# Mandipulse

Self-healing mandi (wholesale produce market) price-monitoring platform powered by Bright Data. A watchdog continuously validates scraped price records, detects schema drift / null spikes / price outliers, and automatically repairs the collector configuration through Bright Data's CLI and DCA trigger — escalating to a human only when the auto-repair fails its repair-grade threshold.

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Frontend — Vite + React 19 + TS + Tailwind v4 + shadcn/ui  :5173  │
│  Header (Simulate DOM Drift) · PriceTicker · MandiTable            │
│  HealingTerminal (live SSE transitions) · IncidentTimeline         │
└───────────────────────────────┬────────────────────────────────────┘
                                │  /api/* (Vite dev proxy / Vercel rewrite)
                                ▼
┌─────────────────────── Fastify API (ESM, TS)  :3000 ──────────────┐
│  GET /collectors · GET /prices · GET /incidents                    │
│  GET /stream (SSE heal events, history replay + live)              │
│  POST /simulate-drift ────────────────────────────┐                │
└───────────────────────────────────────────────────┼────────────────┘
                                                    ▼
┌─────────────────────────── Watchdog core ─────────────────────────┐
│  scheduler (node-cron) ──► runWatchdog                             │
│     ├─► validator: schema drift / field presence                   │
│     ├─► anomalyDetector: null spike (25%), price outlier (60%)     │
│     └─► createIncidentIfAbsent (dedupes open incidents)            │
│  healIncident:  DETECTED → HEALING → bdata CLI heal →              │
│     RepairPreview → repairGrader (weights, ≥ 0.8) →                │
│     GRADED → RECOVERED (auto-approved) | ESCALATED                 │
│  eventBus (pub/sub + history) ───────────────► SSE to frontend     │
└───────┬───────────────────────────────┬────────────────────────────┘
        ▼                               ▼
┌──────────────────────────┐  ┌─────────────────────────────────────┐
│ Bright Data CLI           │  │ Bright Data REST API                │
│ npx @brightdata/cli       │  │ POST https://api.brightdata.com     │
│   bdata scraper heal ...  │  │   /dca/trigger (DCA job launch)     │
│ (cli.ts:54)               │  │ (restClient.ts:56)                  │
└──────────────────────────┘  └─────────────────────────────────────┘
        ▼                               ▼
┌────────────────────────────────────────────────────────────────────┐
│ PostgreSQL 16 (docker compose)  —  Collector · PriceTick ·         │
│ Incident · Grade (Prisma, FK cascade, enum statuses)               │
└────────────────────────────────────────────────────────────────────┘
```

## Repository layout

```
mandipulse/
├── packages/
│   ├── backend/   Fastify API, watchdog, Bright Data clients, Prisma
│   └── frontend/  React dashboard (SSE live view)
├── docker-compose.yml   PostgreSQL 16
├── railway.json         backend deploy (Railway)
└── vercel.json          frontend deploy (Vercel)
```

## Prerequisites

- Node.js ≥ 22
- pnpm ≥ 11 (`npm install -g pnpm`)
- Docker Desktop (for local PostgreSQL)
- Bright Data account + API token (optional for live repairs; the demo escalates with a CLI failure when no token/collector is configured)

## Setup

```bash
# 1. install workspace dependencies
pnpm install

# 2. configure environment
cp .env.example packages/backend/.env
#    set DATABASE_URL and, if you have one, BRIGHTDATA_API_TOKEN

# 3. start PostgreSQL and apply the schema
pnpm db:up
pnpm db:migrate

# 4. seed collector rows (required — guarantees GET /collectors returns data before first cron tick)
pnpm db:seed

# 5. run backend (:3000) + frontend (:5173) together
pnpm dev
```

Open http://localhost:5173. The three mandi collectors are seeded automatically on backend boot. Click **Simulate DOM Drift** in the header and watch the HealingTerminal progress `DETECT → HEAL → GRADE → RECOVERED/ESCALATED` in real time over SSE.

## Common commands

| Command                        | What it does                                  |
| ------------------------------ | --------------------------------------------- |
| `pnpm dev`                     | Run backend + frontend (parallel, watch mode) |
| `pnpm db:up` / `pnpm db:down`  | Start / stop PostgreSQL container             |
| `pnpm db:migrate`              | Apply Prisma migrations                       |
| `pnpm db:seed`                 | Upsert all registry collectors (active + pending) into DB |
| `pnpm typecheck`               | `tsc` across both packages                    |
| `pnpm lint` / `pnpm format`    | ESLint / Prettier                             |
| `pnpm --filter @mandipulse/backend build` | Compile backend to `dist/`           |
| `pnpm --filter @mandipulse/frontend build`| Production build frontend to `dist/` |

## Bright Data CLI usage

All four CLI verbs used in this project, with real collector IDs:

```bash
# CREATE — spin up a new collector from a URL + extraction description
# Used by: packages/backend/scripts/create-msamb-collector.ts
npx -p @brightdata/cli bdata scraper create \
  https://www.msamb.com/ApmcDetail/APMCPriceInformation \
  "Extract the daily APMC market price table: commodity name, market/APMC name, minimum price, maximum price, average or modal price, and arrival quantity, for all rows currently shown on the page." \
  --timeout 1800
# → returned collector ID: c_mt364sxr1jxad1qpuy (Mumbai APMC Bajarbhav)

# RUN — trigger a one-shot scrape and write results to a JSON file
npx -p @brightdata/cli bdata scraper run c_mt364sxr1jxad1qpuy \
  https://apmcmumbai.org/bajarbhav/daily-bajarbhav-dates/veg \
  --pretty -o mumbai-run.json
# → produced 56 real rows (2 MB) — see mumbai-run.json at repo root

# HEAL — submit a natural-language diagnosis and get a repair preview
# Invoked programmatically by healingEngine.ts on every SCHEMA_DRIFT incident
npx -p @brightdata/cli bdata scraper heal c_mt364sxr1jxad1qpuy \
  "Collector navigates to stale archive date (Aug 3) instead of today's /daily-bajarbhav-dates/veg. Fix: always resolve the current date dynamically and navigate to the correct dated URL."
# → repair preview parsed by repairGrader.ts; score ≥ 0.8 → auto-approved

# APPROVE — accept a pending repair preview
npx -p @brightdata/cli bdata scraper approve c_mt364sxr1jxad1qpuy
```

- All four commands are executed programmatically via `execa` with a 1800s timeout — `packages/backend/src/brightdata/cli.ts` (Windows resolves `npx.cmd` at line 96).
- The diagnosis prompt is built from the scraped-schema diff in `packages/backend/src/watchdog/healingEngine.ts:37`.
- Approved repairs (score ≥ 0.8) mark the incident `RECOVERED`; failures escalate to `ESCALATED` — `packages/backend/src/grader/repairGrader.ts:40`.
- The Bright Data REST API is used separately to launch DCA jobs: `POST https://api.brightdata.com/dca/trigger` — `packages/backend/src/brightdata/restClient.ts:56` (`triggerDca`, Bearer token from `BRIGHTDATA_API_TOKEN`).

## How this satisfies the hackathon rubric

| Rubric requirement | Implementation | Where |
| --- | --- | --- |
| **CLI usage** | `npx @brightdata/cli bdata scraper heal <collectorId> <diagnosis>` drives the repair loop; `execFile` + timeout + stderr error mapping; Windows-safe `npx.cmd` | `packages/backend/src/brightdata/cli.ts:54,57,96` |
| **Bright Data DCA `/dca/trigger`** | `triggerDca` POSTs to `https://api.brightdata.com/dca/trigger` with `Authorization: Bearer` from `BRIGHTDATA_API_TOKEN`; 60s timeout + typed errors | `packages/backend/src/brightdata/restClient.ts:1,39,56` |
| **Self-healing automation** | `healIncident` pipeline: mark `HEALING` → build NL diagnosis → run CLI heal → parse `RepairPreview` → `gradeRepair` (field presence 0.35 / type validity 0.25 / price bounds 0.25 / row count 0.15, threshold 0.8) → persist `Grade` → `RECOVERED` or `ESCALATED`; driven on a schedule by `startWatchdog` (node-cron) and on demand via `POST /api/simulate-drift`; all transitions stream live over SSE | `packages/backend/src/watchdog/healingEngine.ts:37` · `packages/backend/src/watchdog/scheduler.ts:44,69` · `packages/backend/src/grader/repairGrader.ts:40` · `packages/backend/src/routes/api.ts:88,124` |
| **Long-tail data target** | State APMC/mandi portals — Mumbai APMC Bajarbhav (working, `c_mt364sxr1jxad1qpuy`) and MSAMB Maharashtra state-wide prices. Additional `.gov.in` portals (HOPCOMS Mysore, MP e-Mandi) were vetted and attempted but blocked by Bright Data's KYC requirement for government domains — documented honestly in `MANDI_PORTALS.md` and Known Limitations below. Registry drives collector seeding, watchdog, and heal targets. | `packages/backend/src/collectors/mandi-registry.ts:11-28` · `MANDI_PORTALS.md` |
| **Self-healing seed data** | `seed-data/genuine-heal-mumbai.json` is a REAL captured repair of a REAL bug: the Mumbai APMC collector was navigating to a stale archive date (Aug 3) instead of today's `/daily-bajarbhav-dates/veg`. The heal CLI fixed the date-resolution logic. This is not synthetic — it is the actual CLI output from the repair run. | `seed-data/genuine-heal-mumbai.json` · `packages/backend/scripts/run-genuine-heal.ts` |
| *(supporting)* Anomaly detection | Null-spike (25% of records) and price-outlier (>60% vs 7-day rolling median) detection | `packages/backend/src/watchdog/anomalyDetector.ts:24,70` |
| *(supporting)* Schema drift + dedupe | Field-presence validation, drift incident creation with open-incident dedupe | `packages/backend/src/watchdog/validator.ts:26,41,72` |

## Known Limitations

- **MSAMB field mapping pending** — the MSAMB collector (`PENDING` in `mandi-registry.ts`) requires a live Bright Data API key to create. Once created, the exact column names returned by the scraper need to be verified against the live site and mapped in `rawFields`. The collector creation script is ready: `pnpm --filter @mandipulse/backend zombies` or `tsx packages/backend/scripts/create-msamb-collector.ts`.
- **KYC-gated `.gov.in` portals out of scope** — HOPCOMS Mysore (`hopcomsmysore.karnataka.gov.in`) and MP e-Mandi (`eanugya.mp.gov.in`) were fully vetted (see `MANDI_PORTALS.md`) and collector creation was attempted. Bright Data blocks `.gov.in` domains until KYC is completed at https://brightdata.com/cp/kyc. These portals are documented as the intended next targets, not silently omitted.
- **Punjab PSAMB (AngularJS SPA)** — Bright Data AI collector generation failed on the AngularJS filter-driven SPA at `emandikaran-pb.in`. A direct JSON API call to the Angular factory endpoint is the recommended workaround for a future iteration.
- **Mumbai collector heal candidate** — the working collector navigates to a dated archive page rather than always resolving today's URL dynamically. The genuine heal in `seed-data/genuine-heal-mumbai.json` fixes this; re-enabling the collector in the Bright Data dashboard and re-running the approve step completes the repair.

## Deploying

### Railway (backend)

`railway.json` is included. Create the service from the repo root; Railway (Nixpacks) will install workspace deps, build the backend, and start it:

- **Env vars**: `DATABASE_URL` (add a Railway Postgres plugin or external Postgres, e.g. Neon), `BRIGHTDATA_API_TOKEN` (optional), `PORT` (Railway sets it automatically).
- Run `pnpm db:migrate` once against the production DB (Railway won't run migrations automatically).
- Healthcheck path: `/health`.

### Vercel (frontend)

`vercel.json` is included (`rootDirectory: packages/frontend`). Add a project env var `BACKEND_URL` pointing at the Railway backend host (e.g. `your-app.up.railway.app`); `/api/*` calls are rewritten to it. CORS is already open on the backend (`origin: true`).

### Production API endpoints

```
GET  /api/collectors        all collectors (with counts)
GET  /api/prices            latest distinct price ticks (optional ?collectorId=)
GET  /api/incidents         incidents, filters ?status= ?type= ?limit=
GET  /api/stream            SSE stream of heal events (history replay + live)
POST /api/simulate-drift    create a SCHEMA_DRIFT incident and start healing
```