# Architecture

## Request path

1. **Caddy** (optional, `--profile tls`) terminates TLS and routes `/mcp*` to the MCP service, `/v1/*` to the API, everything else to Next.js.
2. **API middleware** assigns a request id, applies a per-identity rate limit (20/min for `/v1/auth/*`, 600/min elsewhere), logs one structured JSON line with status and duration.
3. **Authentication** resolves an `Actor`: a user (JWT, membership role) or an API key (member-level, tenant-fixed). Missing or bad credentials are 401; wrong tenant membership is 403.
4. **Tenant scoping** is explicit in every query (`WHERE tenant_id = actor.tenant_id`). There is no global read endpoint. Cross-tenant access returns 404, not 403, so ids cannot be probed.
5. **Mutations** accept `Idempotency-Key`; the first response body is stored per tenant and replayed on retry, so an agent retry never double-charges or double-sends.

## Data model (`apps/api/letmelead/models.py`)

```
Tenant ─┬─ Membership ─ User           roles: owner | member | viewer
        ├─ ApiKey                      prefix + sha256 hash, revocable
        ├─ Source                      one row per adapter, enabled + quota + last error
        ├─ Target                      the watchlist: company/domain/country
        ├─ Signal ─── LeadSignal ─── Lead ─┬─ Contact
        │                                  ├─ Message ─ Campaign ─ Sequence ─ SequenceStep
        │                                  └─ Reply
        ├─ Enrichment                  provider, kind, status, payload, limitation
        ├─ CreditsLedger (append-only) balance_after + idempotency_key
        ├─ Order ─ Invoice             Stripe checkout lifecycle
        ├─ Webhook ─ WebhookDelivery    signed outbound events with retry state
        ├─ AuditLog                    actor_type/actor_id/action/target/meta/ip
        └─ IdempotencyKey              replayed mutation bodies
```

* `Signal.fingerprint` is `sha1(tenant|domain|type|url|title[:180])` with a unique constraint: repeat scans never duplicate evidence.
* `Lead` is unique per tenant on domain, so the same company is not re-sold twice.
* `CreditsLedger` has no update or delete path; `credits.py` only inserts, and refuses any row that would make the balance negative.

## Signal engine (`services/`)

```
adapters/*.py  →  scoring.py  →  qualification.py  →  personalization.py
   collect        dedupe+score      fit + buyers          message copy
```

* **Adapters** (`jobboard`, `news`, `reddit`, `x`, `google_maps`, `facebook`, `reviews`) only collect and normalise to `RawSignal`. Each declares its requirement; missing credentials raise `SourceUnavailable`, which the engine reports per source instead of failing the scan. Bot protection raises `SourceBlocked` and is never bypassed.
* **Scoring** collapses near-duplicate headlines per domain (`title_similarity` ≥ 0.55), decays points with a per-type half-life, scales by strength, caps per signal type and adds a small bonus for independent sources.
* **Qualification** asks an LLM when configured, with the seller's ICP, the evidence lines, and previous rejection reasons as guidance. Without an LLM it falls back to lexical matching that **never auto-rejects** and records the limitation in `fit_evidence`.
* **Decision-makers** come from the ICP roles, plus names only when a source states them — never invented.
* **Enrichment** (`services/enrichment`) is an interface. The `pattern` provider produces a LinkedIn search link and marks the contact unverified, which the UI shows honestly.

`run_scan` in `services/engine.py` is the orchestrator: resolve targets → run enabled sources → normalise/score → qualify → upsert leads + evidence → emit `lead.created` webhooks. It returns a per-source report (ok, collected, count, error) that both `/v1/sources/scan` and `find_leads` expose.

## Outreach engine (`services/outreach.py`, `pacing.py`, `linkedin_worker.py`)

* A campaign owns one sequence (connect → message, with delays).
* `queue_messages` renders each step for each lead from that lead's own top signal, stores a `Message` row with a scheduled slot and a `meta` record of what was used.
* `process_campaign` sends what is due under three limits: the campaign cap, the account's ramp cap, and the send window (weekdays 07:00–19:00 UTC). Each send is jittered 45–180s.
* `record_reply` writes the reply, marks the lead `replied`, and marks every queued message for that lead `skipped` — a reply always stops the sequence.
* `withdraw_stale` withdraws unanswered invitations older than `OUTREACH_WITHDRAW_AFTER_DAYS`.
* `linkedin_worker.py` encapsulates the browser automation behind an interface with a dry-run mode, so tests and local runs never touch LinkedIn.

## Worker topology (`apps/worker`)

| Queue | Task | Trigger |
| --- | --- | --- |
| `scans` | `scan_tenant` | beat every 6h (per tenant with enabled sources) |
| `outreach` | `process_campaign`, `withdraw_stale` | beat every 10 min / daily 09:30 UTC |
| `default` | `deliver_webhooks` | beat every 60s |

Tasks own their session, never raise for a single tenant's failure, and are idempotent enough that a retry is safe (idempotency keys, unique fingerprints).

## Frontend

Next.js App Router. `(app)` route group wraps pages in `AppShell` (nav, credit badge, theme toggle, sign-out). The API client (`lib/api.ts`) refreshes the access token once on 401, forwards the tenant header, and turns the error envelope into a typed `ApiError`. All reads go through TanStack Query so mutations invalidate precisely.

Pages: onboarding, leads, lead detail (evidence timeline), campaigns, campaign detail (sequence editor, per-lead preview, message log), replies, LinkedIn, credits (ledger + orders), settings (team, keys, MCP config, webhooks), audit.

## Failure behaviour

* Source down → scan report notes it, other sources continue.
* LLM down → heuristics, with the limitation recorded.
* Stripe absent → pending order, no fake credits.
* LinkedIn session invalid → account marked `paused` with a reason, worker skips that tenant.
* Webhook endpoint failing → delivery row retried up to 5 times with its error recorded.
