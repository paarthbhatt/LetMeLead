"""Celery application: queues, routes and the beat schedule.

Worker/beat run as separate containers in Docker Compose (see infra/docker-compose.yml).
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from celery import Celery
from celery.schedules import crontab

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))
sys.path.insert(0, str(ROOT / "apps" / "worker"))

from letmelead.config import settings  # noqa: E402

celery_app = Celery(
    "letmelead",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_time_limit=25 * 60,
    task_soft_time_limit=20 * 60,
    task_default_queue=os.getenv("CELERY_DEFAULT_QUEUE", "letmelead"),
    task_routes={
        "letmelead.scan_tenant": {"queue": "scans"},
        "letmelead.process_campaign": {"queue": "outreach"},
        "letmelead.withdraw_stale": {"queue": "outreach"},
        "letmelead.deliver_webhooks": {"queue": "default"},
    },
    beat_schedule={
        "scan-every-six-hours": {
            "task": "letmelead.schedule_scans",
            "schedule": crontab(minute=0, hour="*/6"),
        },
        "outreach-every-ten-minutes": {
            "task": "letmelead.schedule_outreach",
            "schedule": crontab(minute="*/10"),
        },
        "withdraw-daily": {
            "task": "letmelead.withdraw_all",
            "schedule": crontab(minute=30, hour=9),
        },
        "webhooks-every-minute": {
            "task": "letmelead.deliver_webhooks",
            "schedule": 60.0,
        },
    },
)
