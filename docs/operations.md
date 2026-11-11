# Operations

## Local

```bash
cp .env.example .env
# set JWT_SECRET and SESSION_ENCRYPTION_KEY (commands below)
docker compose up -d --build
docker compose run --rm api python scripts/seed.py
```

Generate secrets:

```bash
python -c "import secrets;print(secrets.token_urlsafe(48))"                       # JWT_SECRET
python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"  # SESSION_ENCRYPTION_KEY
```

Services: `api` (migrations run on boot, then uvicorn), `worker`, `beat`, `mcp`, `web`, `postgres`, `redis`. Optional profiles: `tls` (Caddy) and `exports` (MinIO).

Every service has a healthcheck. Watch startup with `docker compose ps` and `docker compose logs -f api worker`.

## Single VPS

1. Point an A record at the host, open 80/443.
2. `cp .env.example .env`; set `DOMAIN`, `ENV=production`, `WEB_BASE_URL`, `API_BASE_URL`, `NEXT_PUBLIC_API_URL` to the public origin, and real secrets.
3. `docker compose --profile tls up -d --build`. Caddy obtains certificates automatically and routes `/mcp*` → MCP, `/v1/*` → API, everything else → web.
4. `docker compose run --rm api python scripts/seed.py` only if you want demo data; otherwise sign up at `/signup`.
5. Stripe: add `https://$DOMAIN/v1/webhooks/stripe` as a webhook endpoint, copy its signing secret into `.env`, then `docker compose up -d api`.

Sizing: 2 vCPU / 4 GB runs api + worker + beat + web + Postgres comfortably for a few tenants. Give Postgres and Redis volumes real disk and a backup schedule. Raise `WORKER_CONCURRENCY` and add worker replicas (`docker compose up -d --scale worker=2`) before adding API replicas; scans are the CPU-heavy part.

Managed alternative: any host that runs the two Dockerfiles plus managed Postgres/Redis. Set `DATABASE_URL`/`REDIS_URL` and skip the local services.

## Migrations

```bash
docker compose run --rm api alembic -c apps/api/alembic.ini upgrade head   # apply
make revision m="add table"                                                # autogenerate
```

Migrations are the only schema path; the app never calls `create_all` outside tests. Take a backup before an upgrade on a live deployment.

## Backups and restore (Postgres)

```bash
# nightly
docker compose exec -T postgres pg_dump -U letmelead -Fc letmelead > backup-$(date +%F).dump

# restore into a fresh stack
docker compose down
docker compose up -d postgres
docker compose exec -T postgres pg_restore -U letmelead -d letmelead --clean --if-exists < backup-2026-11-11.dump
docker compose up -d
```

Redis holds queues and rate-limit counters only; losing it costs at most in-flight tasks. `credits_ledger` is append-only and ordinary backups are sufficient — but restore it *with* the rest of the database so balances stay consistent with `balance_after`.

## Logs and errors

Production (`ENV=production`) logs one JSON object per line: `level`, `logger`, `message`, `time`, `request_id`, `status`, `event`, optional `exception`. Every response carries `X-Request-ID`, so a user report can be traced to a log line.

Set `SENTRY_DSN` to enable the Sentry hook (`sentry_sdk` is optional; if absent the app logs a warning and continues).

## Health and smoke

```bash
curl -s localhost:8000/v1/health
curl -s localhost:8765/health
python scripts/smoke_api.py --base-url http://localhost:8000
```

`smoke_api.py` walks the acceptance path (signup → onboarding → scan → claim → campaign → sequence → preview → queue → pause → reply stops sequence → credits → key auth) and exits non-zero on the first failure.

## Runbook

| Symptom | Check |
| --- | --- |
| 503 on connecting LinkedIn | `SESSION_ENCRYPTION_KEY` unset; set it, then reconnect |
| Scan reports `unavailable` | That source's credentials in `.env`; the other sources still ran |
| No messages sent | `OUTREACH_ENABLED` and `OUTREACH_DRY_RUN`; campaign status; LinkedIn account status; send window |
| `insufficient_credits` | Free allowance used up; top up in Credits |
| Stripe order stuck `pending` | Webhook endpoint reachable and signing secret correct |
| Token 401 loops | `JWT_SECRET` changed between deploys; users must sign in again |
| Webhooks failing | `webhook_deliveries` rows carry the code and error; retried 5 times |

## Security posture

* No secrets in the repo; `.env` is ignored, `.env.example` holds only placeholders.
* LinkedIn sessions encrypted at rest, never returned by any endpoint.
* API keys stored as sha256 hashes with a lookup prefix; plaintext shown once.
* Role checks on every writer route; owner-only for keys, members and billing.
* Per-identity rate limits; signed webhooks; `Idempotency-Key` replay protection.
