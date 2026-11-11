"""Test harness: one isolated SQLite database per session, a fresh client per test.

Settings are read once at import time, so the environment is prepared before any
`letmelead` module is imported.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))
sys.path.insert(0, str(API_DIR.parents[1] / "packages" / "mcp"))

_TMP = tempfile.mkdtemp(prefix="letmelead-tests-")
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{_TMP}/test.db",
        "JWT_SECRET": "test-secret-value",
        "ENV": "local",
        "LLM_PROVIDER": "none",
        "OUTREACH_DRY_RUN": "true",
        "OUTREACH_ENABLED": "false",
        "SESSION_ENCRYPTION_KEY": "",
        # Pin the unreachable-Redis fallback so rate limiting is deterministic
        # whether or not a live Redis happens to be listening on this machine.
        "REDIS_URL": "redis://127.0.0.1:9/0",
        # The suite makes far more auth calls per minute than a real client.
        "RATE_LIMIT_AUTH_PER_MIN": "10000",
        "RATE_LIMIT_DEFAULT_PER_MIN": "10000",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from letmelead import db as db_module  # noqa: E402
from letmelead.db import Base  # noqa: E402
from letmelead.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _database():
    engine = db_module.init_db_for_tests(os.environ["DATABASE_URL"])
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)


@pytest.fixture()
def session():
    db = db_module.SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture()
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def account(client):
    """A signed-up user with an owner membership and a ready Bearer token."""
    import uuid

    email = f"user-{uuid.uuid4().hex[:8]}@example.com"
    res = client.post(
        "/v1/auth/signup",
        json={"email": email, "password": "correct-horse-battery", "name": "Test Owner", "company_name": "Test Co"},
    )
    assert res.status_code == 201, res.text
    tokens = res.json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    me = client.get("/v1/auth/me", headers=headers).json()
    return {
        "email": email,
        "tokens": tokens,
        "headers": headers,
        "tenant_id": me["active_tenant_id"],
        "memberships": me["tenants"],
    }
