"""IMP-052 for runs: one live automation run per user, and a crash cannot leave one stuck."""
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

import app.core.database as database
from app.core.database import Base, run_migrations
from app.core.exceptions import ConflictException
from app.infrastructure.database.models.models import AutomationRunModel
from app.infrastructure.database.run_persistence import SqlRunPersistence

_GUARD = "uq_automation_run_one_active_per_user"


def _run(user: str, status: str, run_id: str | None = None) -> AutomationRunModel:
    return AutomationRunModel(id=run_id or f"run_{uuid.uuid4().hex[:8]}", user_id=user, status=status)


@pytest.mark.asyncio
@pytest.mark.parametrize("second", ["STARTING", "RUNNING", "PAUSED"])
async def test_database_refuses_a_second_live_run_for_one_user(db_session: AsyncSession, second):
    db_session.add(_run("u1", "RUNNING"))
    await db_session.commit()
    db_session.add(_run("u1", second))
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_finished_runs_and_other_users_do_not_block(db_session: AsyncSession):
    db_session.add_all([_run("u2", s) for s in ("COMPLETED", "FAILED", "ABORTED", "STOPPED")])
    db_session.add_all([_run("u2", "RUNNING"), _run("u3", "RUNNING")])
    await db_session.commit()  # no error


@pytest.mark.asyncio
async def test_starting_a_run_while_one_is_live_is_a_conflict_not_a_crash(db_session: AsyncSession):
    p = SqlRunPersistence()
    now = datetime.now(timezone.utc)
    await p.persist_run_start("r1", "u4", "RUNNING", "naukri", 5, "w", now)
    with pytest.raises(ConflictException):
        await p.persist_run_start("r2", "u4", "RUNNING", "naukri", 5, "w", now)
    assert await p.get_live_run_id("u4") == "r1"
    assert await p.get_live_run_id("nobody") is None
    # nothing half-written: the loser left no row
    rows = (await db_session.execute(select(AutomationRunModel.id).where(AutomationRunModel.user_id == "u4"))).all()
    assert [r[0] for r in rows] == ["r1"]


@pytest.mark.asyncio
async def test_start_endpoint_answers_409_when_a_paused_run_exists_only_in_the_database(
    client: AsyncClient, db_session: AsyncSession
):
    """A paused run used to be ignored by the start check; now it must be resumed or stopped first."""
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": f"run-{uuid.uuid4().hex[:6]}@example.com", "password": "Sup3rSecret!pw", "full_name": "Run User"},
    )
    assert res.status_code in (200, 201), res.text
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    me = (await client.get("/api/v1/auth/me", headers=headers)).json()

    db_session.add(_run(me["id"], "PAUSED", "run_paused1"))
    await db_session.commit()

    res = await client.post("/api/v1/automation/start", json={"source_type": "naukri", "roles": ["Eng"]}, headers=headers)
    assert res.status_code == 409, res.text
    assert "run_paused1" in res.text


@pytest.mark.asyncio
async def test_start_up_ends_runs_a_dead_process_left_live(db_session: AsyncSession):
    db_session.add_all(
        [
            _run("u5", "RUNNING", "left_running"),
            _run("u6", "PAUSED", "left_paused"),
            _run("u7", "STARTING", "left_starting"),
            _run("u8", "STOPPING", "left_stopping"),
            _run("u9", "COMPLETED", "done"),
        ]
    )
    await db_session.commit()

    assert await SqlRunPersistence().recover_interrupted_runs() == 4

    db_session.expire_all()
    rows = {r.id: r for r in (await db_session.execute(select(AutomationRunModel))).scalars()}
    for rid in ("left_running", "left_paused", "left_starting", "left_stopping"):
        assert rows[rid].status == "FAILED"
        assert "restarted" in rows[rid].error_message
        assert rows[rid].finished_at is not None
    assert rows["done"].status == "COMPLETED"  # untouched
    assert await SqlRunPersistence().recover_interrupted_runs() == 0  # idempotent

    # and the user is no longer blocked
    await SqlRunPersistence().persist_run_start("fresh", "u5", "RUNNING", "naukri", 5, "w", datetime.now(timezone.utc))


# ---- migration / legacy paths (same rules as the campaign-execution guard) ----

_INSERT = (
    "INSERT INTO automation_runs (id, user_id, status, source_type, target_count, discovered_count, matched_count, "
    "applied_count, failed_count, worker_id, last_event_seq, last_heartbeat_at, started_at, created_at, updated_at) "
    "VALUES ('{id}', 'dup', 'RUNNING', 'naukri', 1, 0, 0, 0, 0, 'w', 0, '2026-01-01', '2026-01-01', '2026-01-01', '2026-01-01')"
)


@pytest.fixture
def empty_engine(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/r.db")
    monkeypatch.setattr(database, "engine", engine)
    return engine


async def _index_present(engine) -> bool:
    async with engine.connect() as conn:
        return bool((await conn.execute(text(f"SELECT name FROM sqlite_master WHERE name='{_GUARD}'"))).all())


@pytest.mark.asyncio
async def test_migration_creates_the_run_index_on_a_clean_database(empty_engine):
    await run_migrations()
    assert await _index_present(empty_engine)
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_migration_leaves_existing_duplicate_live_runs_alone(empty_engine):
    from alembic import command

    cfg = database._alembic_config()

    def upgrade_to_0005(c):
        cfg.attributes["connection"] = c
        command.upgrade(cfg, "0005")

    async with empty_engine.begin() as conn:
        await conn.run_sync(upgrade_to_0005)
        for i in (1, 2):
            await conn.execute(text(_INSERT.format(id=f"r{i}")))
    await run_migrations()  # applies 0006 for real
    async with empty_engine.connect() as conn:
        n = (await conn.execute(text("SELECT COUNT(*) FROM automation_runs WHERE status='RUNNING'"))).scalar()
    assert n == 2  # data untouched
    assert not await _index_present(empty_engine)  # skipped, not forced
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_legacy_database_gets_the_run_index_and_duplicates_do_not_stop_startup(empty_engine):
    async with empty_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(f"DROP INDEX {_GUARD}"))
    await run_migrations()  # legacy path
    assert await _index_present(empty_engine)

    async with empty_engine.begin() as conn:
        await conn.execute(text(f"DROP INDEX {_GUARD}"))
        for i in (1, 2):
            await conn.execute(text(_INSERT.format(id=f"d{i}")))
        await conn.execute(text("DELETE FROM alembic_version"))  # look legacy again
        await conn.execute(text("DROP TABLE alembic_version"))
    await run_migrations()  # must not crash with duplicates present
    assert not await _index_present(empty_engine)
    await empty_engine.dispose()
