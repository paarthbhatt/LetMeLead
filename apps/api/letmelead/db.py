"""Database session plumbing.

The ORM uses portable column types so the test suite can run on SQLite while
production runs on PostgreSQL (see alembic/versions).
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}


engine: Engine = create_engine(settings.database_url, future=True, **_engine_kwargs(settings.database_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - dialect specific
    if settings.database_url.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db_for_tests(url: str) -> Engine:
    """Build an isolated engine/database for tests."""
    global engine, SessionLocal
    engine = create_engine(url, future=True, **_engine_kwargs(url))
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, class_=Session)
    return engine
