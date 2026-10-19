"""IMP-053: run the one-live-row guards against a real PostgreSQL server.

NOT RUN BY THE AUTHOR: no PostgreSQL server could be installed where this was written, so this file has
never executed. It is skipped unless you point it at a throw-away database:

    TEST_POSTGRES_URL=postgresql+asyncpg://user:pass@localhost:5432/scratch pytest tests/integration/test_postgres_guards.py

It DROPS every table in that database first. Never point it at real data. Needs the `asyncpg` package.
"""
import os

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine

import app.core.database as database
from app.core.database import Base, run_migrations
import app.infrastructure.database.models.models  # noqa: F401

URL = os.environ.get("TEST_POSTGRES_URL")
pytestmark = pytest.mark.skipif(not URL, reason="set TEST_POSTGRES_URL to a scratch PostgreSQL database")


@pytest.fixture
async def pg(monkeypatch):
    engine = create_async_engine(URL)
    monkeypatch.setattr(database, "engine", engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
    yield engine
    await engine.dispose()


@pytest.mark.asyncio
async def test_migrations_create_both_guard_indexes_and_they_refuse_duplicates(pg):
    await run_migrations()
    async with pg.connect() as conn:
        names = {r[0] for r in (await conn.execute(text("SELECT indexname FROM pg_indexes"))).all()}
    assert {"uq_campaign_one_active_execution", "uq_automation_run_one_active_per_user"} <= names

    insert = (
        "INSERT INTO automation_runs (id, user_id, status, source_type, target_count, discovered_count, matched_count,"
        " applied_count, failed_count, worker_id, last_event_seq, last_heartbeat_at, started_at, created_at, updated_at)"
        " VALUES ('{id}', 'u1', 'RUNNING', 'naukri', 1, 0, 0, 0, 0, 'w', 0, now(), now(), now(), now())"
    )
    async with pg.connect() as conn:
        await conn.execute(text("INSERT INTO users (id, email, hashed_password, full_name) VALUES ('u1','a@b.c','x','A')"))
        await conn.execute(text(insert.format(id="r1")))
        with pytest.raises(IntegrityError):
            await conn.execute(text(insert.format(id="r2")))
        await conn.rollback()
