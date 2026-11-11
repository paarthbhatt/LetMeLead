# Next Steps — Agent Reach integration

## Context

- **Project**: a local, free buying-signal lead engine for **any company or client**
  (repo: LetMeLead). Dashboard + MCP server, SQLite, no billing.
- **Pipeline today**: brief → sources (public job/news/tech scan, Reddit) → plain-language reason +
  age → AI fit-check → dedupe → enrichment → credits → outreach queue.
- **Target repo**: https://github.com/paarthbhatt/LetMeLead.git
- **Hard constraints**
  - **Free only.** No paid APIs, no paid proxies, no paid scraping services.
  - **No secrets in the repo.** `.env`, `data/`, `runs/`, logs are gitignored.
  - **X/Twitter is read-only** via an existing logged-in session. Never post, like, follow or DM.
  - Do **not** ask the user to paste cookies/tokens into chat. Use Agent Reach's own browser
    profile / login flow, or a local gitignored file the user fills in themselves.

## Already done

- Working local app: `/health`, dashboard at `http://127.0.0.1:8787/`, MCP at `/mcp` (31 tools).
- Pipeline: `src/engine/pipeline.ts` (sources → dedupe → fit → rank → enrich → upsert → credits).
- Sources: `src/sources/{publicScan,reddit,providers,index}.ts`; scoring mirrors Ekos `weights.json`.
- Fit-check (`src/engine/fit.ts`), enrichment hook (`src/engine/enrich.ts`), outreach
  (`src/engine/outreach.ts`, manual/webhook senders; LinkedIn gated).
- Dashboard source toggles, fit/confidence/credits/source columns, "Why?" explain.
- Docs: `README.md`, `skill/SKILL.md`, `.env.example`.
- `npx tsc --noEmit` clean; end-to-end pipeline + manual outreach verified.

---

## Task 1 — Install Agent Reach

Repo: https://github.com/Panniantong/Agent-Reach (MIT). It gives read-only access to web, X,
Reddit, LinkedIn jobs, GitHub, YouTube, etc., via a CLI that returns JSON.

Steps:

1. `uv --version` (already installed: 0.11.26).
2. Install from the GitHub release zip (never PyPI):
   ```powershell
   uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
   agent-reach setup
   ```
3. If `agent-reach` is not on PATH: `uv tool update-shell`, open a new shell, retry.
4. Verify: `agent-reach channels` (JSON). Then add the free read-only channels we need:
   ```powershell
   agent-reach add reddit
   agent-reach add linkedin
   agent-reach add twitter
   agent-reach add facebook
   ```
   Default channels (web, github, youtube, v2ex, bilibili) come with `setup`.
5. Login is **user-driven**: `agent-reach login twitter` (or reddit/facebook) opens the dedicated
   browser; the user logs in themselves. Agent Reach may import the existing Chrome session for
   that site. Do not read password stores and do not handle cookies in chat.
6. Record `agent-reach doctor` / `agent-reach check` output for status reporting.

Notes:
- Each command prints `{schema_version, ok, channel, action, backend, items, meta, error}`.
- Error codes: `NEED_SETUP`, `NEED_LOGIN`, `UPSTREAM_BROKEN`, `TIMEOUT`, `RATE_LIMITED`,
  `NOT_FOUND`, `BAD_INPUT` — surface these as source errors, not crashes.
- Free-only: Agent Reach itself has zero API fees. Do not enable paid sponsor tools.

## Task 2 — Integrate Agent Reach into the pipeline

Goal: add Agent Reach as a first-class **free** signal source, alongside `public_scan` and `reddit`.

Files:

- **New** `src/sources/reach.ts`
  - Detect availability: run `agent-reach channels` once (cache in memory); a channel is
    `available` when the CLI exists and the channel is installed.
  - `runReach(channel, action, query, ctx)`: spawn the CLI, parse JSON, map `items` to
    `RawSignal` (`company`, `domain`, `signal`, `date`, `source`, `source_url`, `summary`).
  - Map channels → signal types:
    - `web` / `github` → `problem_post` / `switching_intent` / `social_mention`
    - `twitter` (X) → `switching_intent`, `problem_post`, `social_mention`
    - `reddit` → `switching_intent`, `problem_post`
    - `linkedin` (jobs only) → `role_hiring` (public job listings, no profile scraping)
    - `facebook` → `social_mention` / `local_business`
  - Company/domain extraction: prefer the target's domain when the result matches a target
    company name; otherwise derive a domain from the result URL (skip if unknown).
  - Never invent dates: use the item's date or drop the signal.
- **Edit** `src/sources/index.ts`
  - Add `reachWebSource`, `reachXSource`, `reachRedditSource`, `reachLinkedInSource`,
    `reachFacebookSource` (or one `reachSource` with a channel param) to `SOURCES`.
  - Keep `sourceStatus()` honest: `available` = CLI present + channel installed + (for
    login-walled channels) session present.
- **Edit** `src/sources/providers.ts`
  - Make the paid `X_BEARER_TOKEN` path a fallback only; Agent Reach (free session) is the
    primary X path. Do not require paid keys.
- **Edit** `src/config.ts`
  - Add `reach: { bin: string; enabled: boolean }` from env `AGENT_REACH_BIN` (default
    `agent-reach`) and `AGENT_REACH_ENABLED` (default true).
- **Edit** `.env.example`
  - Document `AGENT_REACH_BIN`, `AGENT_REACH_ENABLED`, and that Agent Reach replaces the paid
    X bearer token for free usage.
- **Edit** `src/engine/pipeline.ts` only if needed for per-source errors/notes (it already
  records `ok`, `error`, `note`).

Free alternatives to add while here (all no-key):
- Hacker News Algolia API, Bluesky public search, Mastodon public search, Google News RSS,
  GitHub search, Product Hunt RSS, dev.to/Stack Exchange. Keep them optional and off by default.

## Task 3 — Configure a company profile and target list

LetMeLead is industry-agnostic. Set a profile for the company or client you are
generating leads for via `PUT /api/settings` (or the `update_settings` MCP tool):

- `website`: the company's site (used by `generate_brief`).
- `offer`: what they sell, in one or two plain sentences.
- `buyers`: the personas who buy it.
- `roles`: role keywords used by job-board signals.
- `region`: target geography.
- `exclusions`: competitors, agencies, students, anyone who asked not to be contacted.
- `sources`: free set only (`public_scan`, `reddit`, and Agent Reach channels after Task 2).
- `target_list`: path to the target CSV.

Replace `data/targets.csv` with a real ICP list (company, domain, country) — 20–50 rows.
No paid discovery service.

Then run `POST /api/brief` (or `generate_brief`) from the website, and verify
`GET /api/status`.

## Task 4 — Wire MCP, web, dashboard, docs

- **MCP** (`src/mcp/server.ts`): add `reach_search` (`channel`, `query`, `limit`) and
  `reach_read` (`url`) tools that shell out to Agent Reach and return JSON. Extend
  `source_status` to include Agent Reach availability/session state.
- **Web** (`src/web.ts`): add `GET /api/reach/channels`, `POST /api/reach/search`,
  `POST /api/reach/read`.
- **Dashboard** (`public/index.html`): show Agent Reach source badges and a small
  "Reach" panel (channel status + a search box). Keep the existing source toggles working.
- **Docs**: update `README.md` and `skill/SKILL.md` with the free Agent Reach workflow, the
  read-only/X-session policy, and the new tools. Add an Agent Reach section to
  `THIRD_PARTY.md` (MIT attribution).

## Task 5 — Test end-to-end

1. `npx tsc --noEmit` clean.
2. Start server (`npm start`); `GET /health`.
3. `agent-reach channels` works; `reach_search` returns items for a known query.
4. Run pipeline with `sources: ["public_scan","reach_web","reach_reddit"]`; confirm candidates
   and leads, and that `explain_lead` shows Agent Reach signals with sources/dates.
5. Dashboard loads; source toggles and Reach panel work.
6. Confirm no secrets or large files are tracked (`git status`, `.gitignore`).
7. Stop the test server (kill the process on port 8787) before committing.

## Known gotchas

- A stale server on port 8787 will silently serve old code. Always kill it before tests:
  `Get-NetTCPConnection -LocalPort 8787 -State Listen | Stop-Process -Id <pid>`.
- `node:sqlite` is experimental (warning is expected).
- Agent Reach browser channels may hit `NEED_LOGIN`; report it to the user instead of failing
  the whole pipeline.
- Never commit `~/.agent-reach` (lives outside the repo), `.env`, `data/`, `runs/`.
