# LetMeLead

A local, free **buying-signal lead engine for any company or client**. It finds
companies showing real buying signals right now, explains *why* in plain language
(with the signal's age), checks fit, enriches contacts, and queues outreach. Works
for any offer and any ICP — configure a company profile and a target list, and it
runs.

Everything is self-hosted: SQLite on your machine, a dashboard, and an MCP server so
Claude Code, Codex, Cursor or any MCP client can drive it. No third-party account or
paid API is required for the default sources.

## Workflow

1. **Company profile** — website, offer, buyer personas, role keywords, region,
   exclusions. `generate_brief` can draft it from a website; you can also set it by hand.
2. **Signals** — run one or more free sources over a target list:
   - `public_scan` — job boards, news, tech checks, hiring volume (vendored MIT engine)
   - `reddit` — public posts asking for recommendations / describing the problem
   - `x`, `maps`, `facebook`, `reviews` — optional providers (see Configuration)
3. **Explain** — every signal is scored as `weight × strength × 0.5^(age / half-life)`,
   capped per type, with a source-diversity bonus. Each lead shows the signal in plain
   words, how old it is, and its source.
4. **Fit-check** — an LLM (or heuristic fallback) decides if the company is a plausible
   buyer for the offer, with a confidence. Clear non-fits are dropped.
5. **Dedupe + rank** — same domain+signal+date+summary is collapsed; accounts ranked.
6. **Enrich** — LinkedIn search link always; email/phone if an enrichment adapter is set.
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
  store.ts            accounts, settings, leads, signals, campaigns, credits CRUD
  scoring.ts          signal weights + time-decay ranking
  llm.ts              optional OpenAI-compatible LLM calls
  targets.ts          target list loading + exclusions
  engine/
    pipeline.ts       sources -> dedupe -> fit -> rank -> enrich -> upsert -> credits
    signals.ts        thin wrapper over the pipeline (agent-facing)
    fit.ts            AI fit-check + heuristic fallback
    enrich.ts         LinkedIn search link + provider hook
    outreach.ts       compose/queue/run outreach (manual, webhook, gated linkedin)
    brief.ts          website -> company profile
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
git clone https://github.com/paarthbhatt/LetMeLead.git
cd LetMeLead
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
    "letmelead": {
      "command": "npx",
      "args": ["tsx", "<path-to>/LetMeLead/src/mcp/stdio.ts"],
      "cwd": "<path-to>/LetMeLead"
    }
  }
}
```

**Streamable HTTP**: register `http://127.0.0.1:8787/mcp`. If you set `LOCAL_MCP_KEY`
in `.env`, send `Authorization: Bearer <key>`.

Then paste the local skill (`skill/SKILL.md`) into your agent's skills folder, or just
ask: *"Call get_setup_status, then find me leads for my company."*

## Configuration

Copy `.env.example` to `.env`. Everything is optional:

| Variable | Purpose |
| --- | --- |
| `PORT` | Dashboard/MCP port (default 8787) |
| `DB_PATH` | SQLite file (default `./data/leads.db`) |
| `LOCAL_MCP_KEY` | Optional bearer token for `/mcp` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Any OpenAI-compatible endpoint for briefs, fit checks, sequences |
| `X_BEARER_TOKEN` | X/Twitter source (paid X API; optional) |
| `GOOGLE_MAPS_API_KEY` / `MAPS_QUERY` | Google Maps source |
| `FB_ACCESS_TOKEN` / `FB_PAGE_IDS` | Facebook source |
| `REVIEWS_FEED_URL` | JSON review feed source |
| `PREDICTLEADS_*`, `FIRECRAWL_API_KEY`, `APIFY_TOKEN` | Optional providers used by the vendored engine |
| `ENRICH_PROVIDER` / `ENRICH_API_KEY` | Email/phone enrichment adapter |
| `OUTREACH_WEBHOOK_URL` | Webhook sender target |
| `ENABLE_LINKEDIN_AUTOMATION` | Leave `false`; LinkedIn automation is gated |

The default sources (`public_scan`, `reddit`) are free and need no keys. Everything
else is opt-in.

## Company profile and target list

Set the profile from the dashboard or with `update_settings` / `generate_brief`:
website, offer, buyers, roles, region, exclusions. This is what makes the tool work
for *your* company or client — there are no built-in assumptions about an industry.

The pipeline scans `data/targets.csv` (or the path in `settings.target_list`, or targets
passed directly). Columns: `company,domain,country` (plus optional
`employer,news_query,careers_url`). Replace the example rows with your own ICP.

To auto-discover accounts, wire a discovery source into `src/sources/` (a search API,
Crunchbase, or a public directory). The pipeline is source-agnostic.

## Attribution

The vendored `vendor/buying-signal-scan/` engine and its scoring weights come from
**Ekos Labs' MIT-licensed `buying-signal-scan` skill** (see `THIRD_PARTY.md` and the
license file in that folder). LetMeLead is an independent project and is not affiliated
with or endorsed by Ekos Labs.

## What this deliberately does not do

- **No LinkedIn automation.** LinkedIn's terms prohibit automated messaging and
  scraping. The `linkedin` sender is gated behind `ENABLE_LINKEDIN_AUTOMATION=true`
  and is not implemented; use `manual` or `webhook`.
- **No scraping of third-party apps.** Public data sources only.
- **No bypassing bot protection.** Blocked sites are reported, not worked around.
- **No personal profiles.** Company-level public signals only.

## Roadmap

- Target discovery from the company profile (public search / directories).
- Deeper enrichment adapters (LinkedIn, email, phone).
- Scheduled scans (the vendored engine supports `state/` growth tracking).
