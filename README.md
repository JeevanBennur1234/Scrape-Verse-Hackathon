# MandiPulse

MandiPulse is a wholesale agricultural intelligence platform equipped with automated watchdog surveillance and **self-healing AI scraper repair**. Powered by **Bright Data Scraper Studio**, the system continuously monitors data ingestion, detects schema drift, null price spikes, or extreme price outliers, and programmatically triggers the `@brightdata/cli` self-healing engine to repair crawler logic with zero downtime.

---

### 🚀 Live Submission Links

* **Live Demo**: [https://scrape-verse-hackathon-frontend-88s.vercel.app/](https://scrape-verse-hackathon-frontend-88s.vercel.app/)
* **GitHub Repository**: [https://github.com/JeevanBennur1234/Scrape-Verse-Hackathon](https://github.com/JeevanBennur1234/Scrape-Verse-Hackathon)
* **Demo Video**: [Coming soon / YouTube link]

---

## ⚡ Key Architecture & Self-Healing Loop

MandiPulse uses a closed-loop system to protect crawler integrity against target website changes:

```
┌────────────────────────────────────────────────────────────────────┐
│  Frontend — Vite + React 19 + TS + Tailwind v4 + shadcn/ui         │
│  Announce Bar · Header (Simulate Drift) · Live Price Ticker        │
│  HealingTerminal (live SSE log feed) · IncidentTimeline            │
└───────────────────────────────┬────────────────────────────────────┘
                                │  /api/* (Vercel edge proxy rewrite)
                                ▼
┌─────────────────────── Fastify API (ESM, TS)  ─────────────────────┐
│  GET /collectors · GET /prices · GET /incidents                    │
│  GET /stream (SSE live event bus)                                  │
│  POST /simulate-drift ────────────────────────────┐                │
└───────────────────────────────────────────────────┼────────────────┘
                                                    ▼
┌─────────────────────────── Watchdog Core ──────────────────────────┐
│  scheduler (node-cron) ──► runWatchdog                             │
│     ├─► validator: schema drift / field presence                   │
│     ├─► anomalyDetector: null price spikes / extreme outliers      │
│     └─► createIncidentIfAbsent (dedupes open incidents)            │
│  healIncident:  DETECTED → HEALING → bdata CLI heal →              │
│     RepairPreview → repairGrader (weights, ≥ 0.8) →                │
│     GRADED → RECOVERED (auto-approved & deployed) | ESCALATED      │
└───────┬───────────────────────────────┬────────────────────────────┘
        ▼                               ▼
┌──────────────────────────┐  ┌─────────────────────────────────────┐
│ Bright Data CLI           │  │ Bright Data REST API                │
│ npx @brightdata/cli       │  │ POST https://api.brightdata.com     │
│   bdata scraper heal ...  │  │   /dca/trigger (DCA job launch)     │
└──────────────────────────┘  └─────────────────────────────────────┘
        ▼                               ▼
┌────────────────────────────────────────────────────────────────────┐
│ SQLite Database (Dev/Production) — Prisma ORM                      │
│ Collector · PriceTick · Incident · Grade (Cascading relationships)  │
└────────────────────────────────────────────────────────────────────┘
```

### Ingestion Data Source
* **Target Website**: [CommodityOnline Mumbai Market Rates](https://apmcmumbai.org/bajarbhav/daily-bajarbhav-dates/veg)
* **Status**: Healthy, non-government, public market rates (fully compliant with hackathon guidelines).
* **Collector ID**: `c_mt364sxr1jxad1qpuy`

---

## 📦 Example Structured Output
The custom Scraper Studio crawler extracts unstructured HTML tables into structured JSON. Below is an example payload representing the parsed output:

```json
{
  "commodity_name": "Potato",
  "market_name": "Mumbai Market",
  "min_price": 1200,
  "max_price": 1800,
  "avg_price": 1500,
  "arrival_qty": 3500,
  "report_date": "Monday, 23 Aug, 2026"
}
```

---

## 📋 How this satisfies the hackathon rubric

| Rubric Requirement | Implementation details | File Reference |
| --- | --- | --- |
| **CLI Usage** | Programmatic execution of `npx @brightdata/cli bdata scraper heal <id>` to submit diagnostics and generate repair preview scripts. Handles process timeouts and maps stderr gracefully. | [`cli.ts`](file:///c:/Users/bennu/Documents/7thsem/scrape-verse/mandipulse/packages/backend/src/brightdata/cli.ts) |
| **Bright Data DCA `/dca/trigger`** | Implements the DCA HTTP POST client to trigger remote crawler jobs automatically upon successful schema repair. | [`restClient.ts`](file:///c:/Users/bennu/Documents/7thsem/scrape-verse/mandipulse/packages/backend/src/brightdata/restClient.ts) |
| **Self-Healing Automation** | Orchestrates the `DETECTED → HEALING → GRADED → RECOVERED` lifecycle. Automatically parses the repair preview and runs grading checks. | [`healingEngine.ts`](file:///c:/Users/bennu/Documents/7thsem/scrape-verse/mandipulse/packages/backend/src/watchdog/healingEngine.ts) |
| **Grader Gate & Safety** | Grades CLI preview results across 4 weighted metrics (Field Presence `0.35`, Type Validity `0.25`, Price Bounds `0.25`, Row Count Stability `0.15`). Fails safe and escalates if score < `0.80` or hard gates fail. | [`repairGrader.ts`](file:///c:/Users/bennu/Documents/7thsem/scrape-verse/mandipulse/packages/backend/src/grader/repairGrader.ts) |
| **Genuine Seed Capture** | Built using `genuine-heal-mumbai.json`, a real captured CLI repair that patched a date-resolution parser drift issue. | `seed-data/genuine-heal-mumbai.json` |

---

## 🛠️ Local Development Setup

No complex setup or local database container is required; the monorepo uses a local SQLite file database out-of-the-box.

### Prerequisites
- Node.js >= 22
- pnpm >= 11 (`npm install -g pnpm`)

### Setup Commands
```bash
# 1. Install workspace dependencies
pnpm install

# 2. Configure environment variables
cp .env.example packages/backend/.env

# 3. Synchronize SQLite database schema and generate Prisma Client
pnpm --filter @mandipulse/backend build

# 4. Seed database with dynamic historical price ticks and mock logs
pnpm db:seed

# 5. Start Fastify backend and React Vite dashboard concurrently
pnpm dev
```
Open **[http://localhost:5173](http://localhost:5173)** to access the dashboard.

---

## ⚡ Bright Data CLI Programmatic References

These core operations run programmatically inside the watchdog daemon:

```bash
# HEAL: Submits the validator drift diagnosis to trigger the AI repair
npx -p @brightdata/cli bdata scraper heal c_mt364sxr1jxad1qpuy \
  "Scraper navigated to stale page. Resolve current dated URL dynamically."

# APPROVE: Deploys the corrected code/selectors once the grader outputs a score >= 0.80
npx -p @brightdata/cli bdata scraper approve c_mt364sxr1jxad1qpuy
```

---

## 🧠 Known Limitations & Demarcations

* **API Token Dependency for Live CLI Actions**: Programmatic CLI repairs require a loaded `BRIGHTDATA_API_TOKEN` environment variable. If missing or invalid, the watchdog safely logs a process execution error and marks the incident as `ESCALATED` for human check. This serves as a built-in fail-safe.
* **Closed-Loop Simulation Mode**: The dashboard's "Simulate Scenario..." dropdown utilizes genuine captured API payloads and mock inputs to trigger full SSE pipeline updates, allowing judges to evaluate the self-healing process safely in any sandboxed environment.
* **Weekend Inactive Rates**: Wholesale market reports are not generated on Saturdays and Sundays. The repair grader implements a 3-day history allowance, ensuring that evaluations executed on weekends check Friday rates successfully without triggering date-drift errors.