# Integrations

Every provider sits behind an interface in `apps/api/letmelead/services/` and is chosen by env var. Nothing is hardcoded and nothing is required to boot.

## Signal sources

| Source | Env | Notes |
| --- | --- | --- |
| Company job boards | none | Detects the board (Personio, Greenhouse, Lever, Ashby) from the careers page. `hiring_signal` for relevant roles. |
| News | none | Google News RSS per target company. `funding_or_mna`, `leadership_change`. |
| Reddit | `REDDIT_ENABLED` | Public search. Best-effort; a block is reported, never bypassed. `vendor_switch`, `recommendation_request`, `issue_experienced`. |
| X / Twitter | `X_BEARER_TOKEN` | Recent search for the company name. |
| Google Maps / Places | `GOOGLE_MAPS_API_KEY`, `MAPS_QUERY` | Local businesses with a website but thin presence. `local_presence`. |
| Facebook pages | `FB_ACCESS_TOKEN`, `FB_PAGE_IDS` | Page posts as a signal feed. |
| Review feeds | `REVIEWS_FEED_URL` | A URL returning JSON `[{company, domain, date, rating, url, summary}]`. `review_complaint`. |

A source with missing credentials is `unavailable` in the scan report — the scan still succeeds for the others.

## LLM

`LLM_PROVIDER=none|openai|anthropic|ollama`, plus `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

Used for: ICP brief extraction from a website, qualification (`fit`, confidence, disqualifiers, cited evidence), decision-maker titles, and message personalization. All calls go through `services/llm` with a timeout and JSON-only prompts; a failure or malformed response falls back to heuristics and records the limitation. `ollama` lets you run entirely locally.

## Enrichment

`ENRICHMENT_PROVIDER=none|pattern`, `ENRICHMENT_API_KEY`.

`pattern` returns a LinkedIn people-search URL for the ICP role and marks the contact `verified=false`, `confidence≈0.35`. It never invents an email. To plug in Apollo, Clearbit, Proxycurl or similar, implement the provider interface in `services/enrichment/__init__.py`; `Enrichment` rows record provider, kind, status, payload and any limitation, so the UI can always show where a contact came from.

## LinkedIn outreach

Two pieces:

1. **Session** — `scripts/linkedin_session.py` opens Chromium, you sign in (2FA included), it writes a Playwright storage state. Paste it in the dashboard's LinkedIn page; the API encrypts it with `SESSION_ENCRYPTION_KEY` and never returns it.
2. **Worker** — `services/linkedin_worker.py` is the only place that touches LinkedIn. It reads the decrypted session, acts with human pace (`pacing.py`), and honours `OUTREACH_ENABLED` and `OUTREACH_DRY_RUN`.

Safety defaults: dry run on, sending off, 5 invitations/day ramping to 20, jittered 45–180s, weekdays only, reply stops the sequence, pause halts the queue immediately, stale invitations withdrawn after 21 days. Automated messaging can violate LinkedIn's terms; keep the dry run on until you have decided that trade-off for your own account.

Build the image with `INSTALL_PLAYWRIGHT=1` to include Chromium.

## Stripe

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

* `POST /v1/orders/top-up` creates a Checkout Session for `pack × 100` credits at `CREDITS_PACK_PRICE_CENTS` each, records the order and stores the checkout URL.
* `POST /v1/webhooks/stripe` verifies the signature, is idempotent per order, marks the order paid and grants credits with ledger key `order:<id>`.
* There is no subscription object anywhere: credits are bought, never expire, and every movement is visible in the ledger.
* Point Stripe at `https://your-host/v1/webhooks/stripe` and copy the signing secret into `.env`.

## Outbound webhooks

`GET|POST /v1/webhooks` with event names `lead.created`, `lead.claimed`, `reply.received`.

Deliveries are HMAC-signed with the webhook's secret, attempted by the worker every minute, retried up to 5 times, and each attempt is recorded (`WebhookDelivery`: status, code, error, timestamps). A failing endpoint never blocks the action that triggered it.

## Google OAuth

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (default `{API_BASE_URL}/v1/auth/google/callback`). The dashboard's `/auth/callback` page exchanges the code, and the API links or creates the user by verified email, then issues the normal token pair.
