# Compliance, data handling and outreach policy

This document states what the system does, so an operator can decide whether that is acceptable for their jurisdiction and their accounts. It is engineering documentation, not legal advice.

## What data is stored

| Data | Where | Why |
| --- | --- | --- |
| Account: email, name, password hash (argon2), optional Google subject | `users` | Authentication |
| Workspace: name, slug, website, ICP brief | `tenants` | Targeting |
| Signals: title, source URL, date, source name, detail | `signals` | Evidence behind every lead |
| Leads and contacts: company, domain, role titles, public profile URL, optional email/phone | `leads`, `contacts` | Outreach |
| Messages and replies | `messages`, `replies` | Sequence state and the reply stop rule |
| LinkedIn session (Playwright storage state) | `linkedin_accounts.session_blob`, Fernet-encrypted | Sending from the user's own account |
| Credits, orders, invoices | `credits_ledger`, `orders`, `invoices` | Billing |
| Audit rows | `audit_log` | Accountability |

## Data minimisation

* Only public signals are collected: job postings, news, public posts, public reviews, public business listings.
* Names are recorded **only** when a source states them; otherwise the lead carries a role and a search link, marked unverified.
* Emails and phone numbers are only stored when an enrichment provider returns them and the row records which provider and its confidence.
* No scraping of private data, no bypassing logins, bot protection or rate limits (`SourceBlocked` is surfaced, never worked around).

## Retention

There is no automatic purge, by design: a lead's evidence is the product. An operator should set a policy and enforce it with SQL, for example:

```sql
-- signals and leads untouched for 24 months
DELETE FROM leads WHERE tenant_id = $1 AND updated_at < now() - interval '24 months';
-- audit rows older than 12 months
DELETE FROM audit_log WHERE created_at < now() - interval '12 months';
```

Deleting a tenant cascades to its signals, leads, messages, replies, ledger, keys and webhooks. Backups retain deleted data until they expire; rotate them on your own schedule.

## Erasure and access requests

* A person can be removed by deleting their lead (cascades to contacts, messages, replies) or by deleting the tenant.
* `GET /v1/audit` shows every action taken in a workspace, with actor and time, which answers "who contacted me and why" precisely.
* Export: the API returns JSON for every resource; `--profile exports` adds MinIO if you want stored CSV/JSON exports.

## Outreach rules enforced by the software

* Sending is **off by default** (`OUTREACH_ENABLED=false`) and **dry-run by default** (`OUTREACH_DRY_RUN=true`).
* Daily caps: 5/day for a new account, +5 every three days, ceiling 20 (`OUTREACH_MAX_DAILY_CAP`).
* Randomized 45–180 second gaps; weekdays only, 07:00–19:00 UTC.
* A reply stops the lead's sequence immediately, and every queued message for that lead becomes `skipped`.
* Pausing the account or the campaign halts the queue before the next send.
* Unanswered invitations are withdrawn after 21 days.
* Every queued/sent/failed/skipped message is a row, and every claim, send, pause and billing event is in the audit log.

Automated messaging may breach LinkedIn's User Agreement. The controls above reduce risk; they do not make automation permitted. Decide deliberately before enabling live sending, and prefer dry run plus manual sending where policy is unclear.

## Anti-abuse and fair use

* Per-identity rate limits (20/min on auth, 600/min elsewhere) and a per-source daily quota.
* Credits are the only spending mechanism: 10 free claims per workspace, then 1 credit each; the ledger refuses to go negative.
* No lead is sold twice to the same tenant (unique domain per tenant).
* `Idempotency-Key` prevents retries from double-charging or double-sending.

## Security controls

* JWT access/refresh with rotation; refresh tokens are revocable per user by changing the secret.
* API keys are sha256-hashed with an 8-character lookup prefix; plaintext shown once, revocable, and always member-level.
* Tenant isolation enforced in every query; foreign ids return 404.
* LinkedIn sessions encrypted with Fernet; the key is separate from the database and never logged.
* Request ids, structured logs, and an optional Sentry hook.
* Stripe webhook signatures verified; credit grants idempotent per order.

## Transparency to recipients

Signals show timing, not intent. The product rule is that every lead displays:

1. the plain-language reason, dated;
2. the source and URL of each piece of evidence;
3. the age of the signal and its verification status.

If you cannot show a recipient why they were contacted, do not contact them.
