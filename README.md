# LetMeLead

A multi-tenant, done-for-you lead engine. Paste your website, get qualified decision-makers **with a dated reason to buy now**, claim them with credits, and run paced LinkedIn outreach from your own account. Everything the dashboard does is also exposed over MCP, so Claude, Codex or Cursor can drive the whole pipeline.

Signals show timing, not intent to buy. Every lead carries its source URL, a plain-language reason and the age of the evidence, so you can judge it yourself.

---

## What it does

| Stage | Behaviour |
| --- | --- |
| **Watchlist** | Paste a website → an ICP brief is built (from the page, or from what you paste) → a target list is created. |
| **Signals** | Seven adapters collect dated evidence: company job boards, news, Reddit, X, Google Maps, Facebook pages, review feeds. |
| **Qualification** | Signals are de-duplicated per real-world event, decayed by age, scored, and qualified with an LLM when one is configured (lexical heuristics otherwise — never a silent rejection). |
| **Leads** | Ranked leads with reason, signal age, fit confidence and evidence timeline. Claim with credits or mark not-a-fit (the reason feeds back into qualification). |
| **Outreach** | Campaigns + sequences rendered per lead from its own signal. Sending ramps 5→20/day with jitter, only on weekdays, only inside business hours, and pauses the moment a reply arrives. |
| **Credits** | Append-only ledger. 10 free leads per workspace, then 1 credit per claim. Stripe top-ups in packs of 100 (idempotent webhooks). |
| **Agents** | MCP server at `/mcp` (Streamable HTTP, per-tenant API key) with 13 tools mirroring the REST surface. |
| **Audit** | Every claim, send, pause, key change and billing event is recorded with its actor. |

---

## Quick start

```bash
cp .env.example .env        # then set JWT_SECRET and SESSION_ENCRYPTION_KEY
docker compose up -d --build
docker compose run --rm api python scripts/seed.py   # demo workspace + leads
```

* Dashboard — http://localhost:3000 (`demo@letmelead.local` / `demo-password-123` after seeding)
* API docs — http://localhost:8000/v1/docs
* MCP endpoint — http://localhost:8765/mcp

Without Docker:

```bash
make install                 # .venv + python deps + web deps
make dev-api                 # needs Postgres and Redis (see .env)
make dev-web
```

`DOMAIN=your.host docker compose --profile tls up -d` adds Caddy with automatic TLS; `--profile exports` adds MinIO for exports.

---

## Architecture

```
                    ┌──────────────┐        ┌───────────────┐
  browser ─────────▶│  web (3000)  │───────▶│   api (8000)  │
  Claude/Codex ────▶│  MCP (8765)  │───────▶│   FastAPI     │
                    └──────────────┘        └───────┬───────┘
                                                    │
                    ┌──────────────┐        ┌───────▼───────┐
                    │ beat (cron)  │───────▶│ Postgres 16   │
                    └──────┬───────┘        └───────────────┘
                           │                ┌───────────────┐
                    ┌──────▼───────┐        │   Redis 7     │
                    │ worker       │───────▶└───────────────┘
                    │ scans, send  │
                    └──────────────┘
```

* **API** (`apps/api/letmelead`) — FastAPI, SQLAlchemy 2, Alembic. JWT or `X-API-Key`, role checks (owner/member/viewer), tenant scoping in every query, cursor pagination, `Idempotency-Key` replay storage, rate limiting, structured JSON logs, Sentry hook.
* **Worker** (`apps/worker`) — Celery queues `scans`, `outreach`, `default`. Beat scans every 6h, processes active campaigns every 10 min, withdraws stale invitations daily, delivers webhooks every minute.
* **Web** (`apps/web`) — Next.js 14 App Router, Tailwind, shadcn-style primitives, TanStack Query, dark mode, keyboard-accessible tables and forms.
* **MCP** (`packages/mcp`) — same API underneath, so tools and REST can never disagree; `manifest.py` is contract-tested against the registered tools.

Full detail: [docs/architecture.md](docs/architecture.md).

---

## Repository layout

```
apps/api          FastAPI app, models, services, routers, Alembic, tests
apps/worker       Celery app + tasks (scan, outreach, webhooks, withdrawals)
apps/web          Next.js dashboard
packages/mcp      MCP server, API client, tool manifest, CLI client, tests
infra             Dockerfiles, Caddyfile
scripts           seed.py, smoke_api.py, linkedin_session.py
docs              architecture, mcp, integrations, operations, compliance
legacy            the earlier single-user prototype, kept for reference
```

---

## Key API routes

All under `/v1`. Auth: `Authorization: Bearer <jwt>` or `X-API-Key: <key>`; tenant from the token or `X-Tenant-Id`.

```
POST /auth/signup|login|refresh|logout      GET /auth/me, /auth/google
GET|PATCH /tenant                           POST /tenant/onboarding
GET|POST /tenant/members  /tenant/api-keys
GET /sources  PATCH /sources/{id}  POST /sources/scan
GET|POST /targets  POST /targets/import
GET /leads  GET /leads/{id}  POST /leads/{id}/claim|not-fit
GET|POST /campaigns  GET|PATCH /campaigns/{id}
POST /campaigns/{id}/pause|resume|queue|send
PUT  /campaigns/{id}/sequence  GET .../preview/{lead_id}  GET .../messages
GET /replies  POST /replies/ingest  POST /replies/{id}/read  GET /replies/threads
GET|POST /linkedin  POST /linkedin/connect|pause|resume  GET /linkedin/limits
GET /credits  GET /credits/ledger  POST /orders/top-up  GET /orders /invoices
GET|POST /webhooks  GET /audit  GET /health  GET /stats
```

Errors are a uniform envelope: `{"error": {"code", "message", "details", "request_id"}}`.

---

## MCP in one minute

```json
{
  "mcpServers": {
    "letmelead": {
      "type": "http",
      "url": "http://localhost:8765/mcp",
      "headers": { "Authorization": "Bearer lml_..." }
    }
  }
}
```

Tools: `find_leads`, `list_leads`, `get_lead`, `claim_lead`, `mark_not_fit`, `create_campaign`, `pause_campaign`, `send_outreach`, `list_replies`, `get_credits`, `top_up`, `list_campaigns`, `preview_message`. See [docs/mcp.md](docs/mcp.md).

---

## Development

```bash
make test        # pytest (30 tests: ledger, scoring, pacing, qualification, API flow, MCP contract)
make lint        # ruff
make typecheck   # tsc --noEmit
make build       # next build
make smoke       # end-to-end against a running API
```

Migrations: `make migrate`, `make revision m="..."`.

---

## Configuration

Everything is env-driven; see [.env.example](.env.example). Nothing is required to boot except a database and `JWT_SECRET`. Optional providers degrade explicitly:

* **LLM** (`LLM_PROVIDER=openai|anthropic|ollama`) — better qualification, personalization and ICP extraction. Without it you get heuristics, and every affected record says so in its limitations.
* **Enrichment** (`ENRICHMENT_PROVIDER=pattern`) — with no provider, leads carry a LinkedIn search link and an honest "unverified" contact instead of invented emails.
* **Stripe** — without keys, top-up orders are recorded as pending so the ledger remains testable; with keys you get real Checkout sessions and signed webhooks.
* **Outreach** — `OUTREACH_ENABLED=false` and `OUTREACH_DRY_RUN=true` by default: the worker renders and audits messages without sending.

---

## Status

Verified in this environment: Alembic migration, seed, `pytest` (30 passed), `ruff`, `tsc`, `next build`, a full REST acceptance run against a live API on Postgres-compatible storage, and a live MCP session (13 tools, authenticated tool calls, clean error envelopes).

Not verified here: `docker compose up` itself (the sandbox cannot attach container networks) and live LinkedIn sending (needs Playwright + Chromium and one real session). Both paths are implemented and documented; see [docs/operations.md](docs/operations.md).
