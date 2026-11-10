# Epimetheus Leads

A personal, local, free lead engine for **Epimetheus Red** (scoped AI security testing).
It recreates the *workflow* of Ekos Leads — multi-source buying signals → plain-language
reason + age → AI fit-check → dedupe → LinkedIn/contact enrichment → outreach queue →
credits ledger — and exposes it to agents over MCP.

This is a *from-scratch functional equivalent*, built from public information and Ekos
Labs' MIT-licensed `buying-signal-scan` skill. It does **not** use Ekos's private
backend, API keys, or app. See `THIRD_PARTY.md`.

## Workflow

1. **Brief** — turn your website into an ICP: offer, buyer personas, role keywords,
   region, exclusions. Uses your LLM if configured, otherwise a heuristic.
2. **Signals** — run one or more sources over a target list:
   - `public_scan` — job boards, news, tech checks, hiring volume (vendored MIT engine)
   - `reddit` — public posts asking for recommendations / describing the problem
   - `x` — X/Twitter search (needs `X_BEARER_TOKEN`)
   - `maps` — Google Maps/Places local businesses (needs `GOOGLE_MAPS_API_KEY`)
   - `facebook` — Facebook page monitoring (needs `FB_ACCESS_TOKEN`)
   - `reviews` — review feed (needs `REVIEWS_FEED_URL`)
3. **Explain** — every signal is scored as `weight × strength × 0.5^(age / half-life)`,
   capped per type, with a source-diversity bonus. Each lead shows the signal in plain
   words, how old it is, and its source.
4. **Fit-check** — an LLM (or heuristic fallback) decides if the company is a plausible
   buyer for the offer, with a confidence. Clear non-fits are dropped.
5. **Dedupe + rank** — same domain+signal+date+summary is collapsed; accounts ranked.
6. **Enrich** — LinkedIn search link always; email/phone if an enrichment provider is set.
7. **Outreach** — draft sequences, queue leads, and process with a sender:
   `manual` (copy/paste), `webhook` (POST to `OUTREACH_WEBHOOK_URL`), or `linkedin`
   (gated off — see below).
8. **Credits** — each new lead records credits spent and the balance is tracked locally.

## Architecture

```
src/
  index.ts            server entry (dashboard + MCP over HTTP)
  web.ts              Express: REST API + Streamable-HTTP MCP at /mcp
  config.ts           env loading
  db.ts               SQLite schema + migrations (node:sqlite, no native deps)
  store.ts            settings, leads, signals, campaigns, credits CRUD
  scoring.ts          signal weights + time-decay ranking (mirrors Ekos weights.json)
  llm.ts              optional OpenAI-compatible LLM calls
  targets.ts          target list loading + exclusions
  engine/
    pipeline.ts       sources -> dedupe -> fit -> rank -> enrich -> upsert -> credits
    signals.ts        thin wrapper over the pipeline (agent-facing)
    fit.ts            AI fit-check + heuristic fallback
    enrich.ts         LinkedIn search link + provider hook
    outreach.ts       compose/queue/run outreach (manual, webhook, gated linkedin)
    brief.ts          website -> ICP brief
  sources/
    index.ts          source registry + selection + status
    publicScan.ts     runs the vendored Python engine
    reddit.ts         public Reddit search
    providers.ts      X, Google Maps, Facebook, reviews
  mcp/
    server.ts         MCP tool contract
    stdio.ts          stdio entry for desktop agents
public/index.html     dashboard
vendor/buying-signal-scan/   vendored MIT signal engine (Python, stdlib only)
data/targets.csv      example target list (company,domain,country) — replace it
skill/SKILL.md        local agent skill for this tool
```

## Requirements

- Node.js >= 22.5 (uses the built-in `node:sqlite`; tested on 24.x)
- Python 3.9+ on PATH (for the vendored signal scan; stdlib only, no pip installs)
- Network access for public signal sources

## Run

```bash
cd epimetheus-leads
npm install
cp .env.example .env      # optional; add an LLM key and any provider keys
npm start
```

Open http://127.0.0.1:8787/

- `GET /health` — health check
- `POST /mcp` — MCP Streamable HTTP endpoint
- `GET/PUT /api/...` — dashboard REST API

## Connect an agent (MCP)

**Desktop / stdio** (Claude Desktop, Codex, etc.):

```bash
npm run mcp:stdio
```

Point your MCP client at that command, e.g. a Claude Desktop config entry:

```json
{
  "mcpServers": {
    "epimetheus-leads": {
      "command": "npx",
      "args": ["tsx", "C:/Users/Parth/epimetheus-leads/src/mcp/stdio.ts"],
      "cwd": "C:/Users/Parth/epimetheus-leads"
    }
  }
}
```

**Streamable HTTP**: register `http://127.0.0.1:8787/mcp`. If you set `LOCAL_MCP_KEY`
in `.env`, send `Authorization: Bearer <key>`.

Then paste the local skill (`skill/SKILL.md`) into your agent's skills folder, or just
ask: *"Call get_setup_status, then find me leads for Epimetheus Red."*

## Configuration

Copy `.env.example` to `.env`. Everything is optional:

| Variable | Purpose |
| --- | --- |
| `PORT` | Dashboard/MCP port (default 8787) |
| `DB_PATH` | SQLite file (default `./data/leads.db`) |
| `LOCAL_MCP_KEY` | Optional bearer token for `/mcp` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Any OpenAI-compatible endpoint for briefs, fit checks, sequences |
| `X_BEARER_TOKEN` | X/Twitter source |
| `GOOGLE_MAPS_API_KEY` / `MAPS_QUERY` | Google Maps source |
| `FB_ACCESS_TOKEN` / `FB_PAGE_IDS` | Facebook source |
| `REVIEWS_FEED_URL` | JSON review feed source |
| `PREDICTLEADS_*`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN` | Optional providers used by the vendored engine |
| `ENRICH_PROVIDER` / `ENRICH_API_KEY` | Email/phone enrichment adapter |
| `OUTREACH_WEBHOOK_URL` | Webhook sender target |
| `ENABLE_LINKEDIN_AUTOMATION` | Leave `false`; LinkedIn automation is gated |

## Target list

The pipeline scans `data/targets.csv` (or the path in `settings.target_list`, or targets
passed directly). Columns: `company,domain,country` (plus optional
`employer,news_query,careers_url`). Replace the example rows with your own ICP.

This build still starts from a target list you provide. To auto-discover accounts, wire a
discovery source into `src/sources/` (Apollo, PredictLeads, Crunchbase, a search API).

## What this deliberately does not do

- **No LinkedIn automation.** LinkedIn's terms prohibit automated messaging and
  scraping. The `linkedin` sender is gated behind `ENABLE_LINKEDIN_AUTOMATION=true`
  and is not implemented; use `manual` or `webhook`.
- **No scraping of Ekos.** Public data sources only.
- **No bypassing bot protection.** Blocked sites are reported, not worked around.
- **No personal profiles.** Company-level public signals only.

## Roadmap

- Target discovery from the brief (Apollo / PredictLeads / search).
- Deeper enrichment adapters (LinkedIn, email, phone).
- Scheduled scans (the vendored engine supports `state/` growth tracking).
