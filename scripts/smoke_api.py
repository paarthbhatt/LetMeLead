#!/usr/bin/env python3
"""End-to-end smoke test against a running LetMeLead API.

    python scripts/smoke_api.py --base-url http://localhost:8000

Exercises the acceptance path: signup → onboarding → watchlist → leads → claim →
campaign → sequence → preview → queue → reply (stops the sequence) → credits.
Prints a line per step and exits non-zero on the first failure.
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid

import httpx


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--email", default=None, help="use an existing account instead of signing up")
    parser.add_argument("--password", default="smoke-password-123")
    args = parser.parse_args()

    api = httpx.Client(base_url=args.base_url, timeout=60)
    email = args.email or f"smoke-{uuid.uuid4().hex[:8]}@example.com"

    def step(label: str, res: httpx.Response) -> dict:
        if res.status_code >= 400:
            print(f"FAIL {label}: HTTP {res.status_code} {res.text[:300]}", file=sys.stderr)
            raise SystemExit(1)
        print(f"ok   {label}")
        return res.json() if res.content else {}

    token = step(
        "signup", api.post("/v1/auth/signup", json={"email": email, "password": args.password, "company_name": "Smoke Co"})
    )["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    step("tenant", api.get("/v1/tenant", headers=headers))
    step(
        "onboarding",
        api.post(
            "/v1/tenant/onboarding",
            headers=headers,
            json={
                "website": "https://example.com",
                "offer": "Managed SOC 2 readiness for B2B SaaS teams.",
                "buyers": ["CTOs at Series A-C SaaS"],
                "roles": ["security", "compliance", "engineering"],
                "targets": [{"company": "Acme", "domain": "acme.com", "country": "US"}],
                "discover": False,
            },
        ),
    )
    step("sources", api.get("/v1/sources", headers=headers))

    scan = step("scan (may be empty without network access)", api.post("/v1/sources/scan", headers=headers, json={"wait": True}))
    print(f"     scan report: {json.dumps(scan.get('report', {}))[:200]}")

    leads = step("list leads", api.get("/v1/leads", headers=headers)).get("items", [])
    if not leads:
        print(
            "FAIL no leads available. Seed demo data (make seed) or configure a source, then rerun.",
            file=sys.stderr,
        )
        return 1

    lead = leads[0]
    step("lead detail", api.get(f"/v1/leads/{lead['id']}", headers=headers))
    claim = step("claim", api.post(f"/v1/leads/{lead['id']}/claim", headers=headers, json={}))
    print(f"     charged {claim['credits_charged']} (free={claim['was_free']}), balance {claim['credits_remaining']}")

    campaign = step("create campaign", api.post("/v1/campaigns", headers=headers, json={"name": "Smoke campaign"}))
    step(
        "edit sequence",
        api.put(
            f"/v1/campaigns/{campaign['id']}/sequence",
            headers=headers,
            json={
                "name": "Smoke sequence",
                "steps": [
                    {"step_no": 1, "kind": "connect", "body_template": "Hi — saw {signal}. Worth connecting?", "delay_days": 0},
                    {"step_no": 2, "kind": "message", "body_template": "Sharing the playbook on {signal}.", "delay_days": 3},
                ],
            },
        ),
    )
    preview = step("preview", api.get(f"/v1/campaigns/{campaign['id']}/preview/{lead['id']}", headers=headers))
    print(f"     preview: {preview.get('body', '')[:120]}")
    step("queue", api.post(f"/v1/campaigns/{campaign['id']}/queue", headers=headers, json={"lead_ids": [lead["id"]]}))
    step("pause", api.post(f"/v1/campaigns/{campaign['id']}/pause", headers=headers, json={"reason": "smoke test"}))
    step(
        "reply stops the sequence",
        api.post(
            "/v1/replies/ingest",
            headers=headers,
            json={"lead_id": lead["id"], "campaign_id": campaign["id"], "body": "Yes — send the playbook."},
        ),
    )
    step("replies inbox", api.get("/v1/replies", headers=headers))
    credits = step("credits", api.get("/v1/credits", headers=headers))
    print(f"     balance {credits['balance']}, free left {credits['free_leads_remaining']}")
    step("ledger", api.get("/v1/credits/ledger", headers=headers))
    step("audit", api.get("/v1/audit", headers=headers))

    key = step("api key", api.post("/v1/tenant/api-keys", headers=headers, json={"name": "smoke"}))["api_key"]
    step("api-key auth", api.get("/v1/tenant", headers={"X-API-Key": key}))

    print(f"\nAll steps passed. Account: {email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
