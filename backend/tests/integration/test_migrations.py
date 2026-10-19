"""DB-01: schema is managed by Alembic."""
import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

import app.core.database as database
from app.core.database import Base, run_migrations
import app.infrastructure.database.models.models  # noqa: F401
from app.infrastructure.database.models.models import JobModel


@pytest.fixture
def empty_engine(tmp_path, monkeypatch):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/m.db")
    monkeypatch.setattr(database, "engine", engine)
    return engine


async def _tables(engine):
    async with engine.connect() as conn:
        return await conn.run_sync(lambda c: set(inspect(c).get_table_names()))


async def _version(engine):
    async with engine.connect() as conn:
        return (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()


async def _schema_differences(engine):
    async with engine.connect() as conn:
        return await conn.run_sync(
            lambda c: compare_metadata(MigrationContext.configure(c), Base.metadata)
        )


@pytest.mark.asyncio
async def test_fresh_database_gets_the_full_schema_from_migrations(empty_engine):
    await run_migrations()
    tables = await _tables(empty_engine)
    assert {"users", "applications", "jobs", "revoked_tokens", "alembic_version"} <= tables
    assert await _version(empty_engine) == "0007"
    # The migrations and the SQLAlchemy models describe the same schema.
    assert await _schema_differences(empty_engine) == []
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_running_migrations_twice_is_safe(empty_engine):
    await run_migrations()
    await run_migrations()
    assert await _version(empty_engine) == "0007"
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_legacy_database_is_adopted_without_losing_data(empty_engine):
    # A database made the old way: create_all, no alembic_version.
    async with empty_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "INSERT INTO users (id, email, hashed_password, is_active, is_superuser, created_at, updated_at) "
            "VALUES ('u1', 'old@example.com', 'x', 1, 0, datetime('now'), datetime('now'))"
        ))
    assert "alembic_version" not in await _tables(empty_engine)

    await run_migrations()

    assert await _version(empty_engine) == "0007"
    async with empty_engine.connect() as conn:
        emails = (await conn.execute(text("SELECT email FROM users"))).scalars().all()
    assert emails == ["old@example.com"]
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_legacy_mixed_case_job_values_are_normalised(empty_engine):
    """DB-02: older upgrades left lowercase enums and a numeric confidence behind."""
    async with empty_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(
            "INSERT INTO job_sources (id, source_type, base_url, is_active, rate_limit_per_min) "
            "VALUES ('s1', 'naukri', 'https://n', 1, 20)"
        ))
    from sqlalchemy.ext.asyncio import async_sessionmaker

    async with async_sessionmaker(empty_engine, expire_on_commit=False)() as db:
        db.add(JobModel(
            id="j1", source_id="s1", external_job_id="e1", title="Eng", company="Acme",
            location="Remote", apply_url="https://x", raw_description="d",
        ))
        await db.commit()
    # Make the row look like one written by the old upgrade routine.
    async with empty_engine.begin() as conn:
        await conn.execute(text(
            "UPDATE jobs SET posted_at_precision='unknown', freshness_bucket='unknown', "
            "canonical_confidence='1.0'"
        ))
    await run_migrations()
    async with empty_engine.connect() as conn:
        row = (await conn.execute(text(
            "SELECT posted_at_precision, freshness_bucket, canonical_confidence FROM jobs"
        ))).one()
    assert tuple(row) == ("UNKNOWN", "UNKNOWN", "PLATFORM_EXACT")
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_application_check_constraints_and_enum_stay_in_sync(empty_engine):
    """DB-04: bad status values are rejected, and the migration lists every enum value."""
    from app.domain.applications.entities import ApplicationOutcomeStatus, WorkflowStateEnum

    await run_migrations()
    async with empty_engine.connect() as conn:
        ddl = (await conn.execute(text("SELECT sql FROM sqlite_master WHERE name='applications'"))).scalar()
    for member in list(WorkflowStateEnum) + list(ApplicationOutcomeStatus):
        assert f"'{member.value}'" in ddl, f"{member.value} missing from the CHECK constraints"

    async with empty_engine.begin() as conn:
        await conn.execute(text(
            "INSERT INTO users (id, email, hashed_password, is_active, is_superuser, created_at, updated_at) "
            "VALUES ('u1', 'a@b.c', 'x', 1, 0, datetime('now'), datetime('now'))"
        ))
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        async with empty_engine.begin() as conn:
            await conn.execute(text(
                "INSERT INTO applications (id, user_id, job_id, idempotency_key, workflow_state, "
                "outcome_status, retry_count, created_at, updated_at) "
                "VALUES ('a1', 'u1', 'j1', 'k1', 'NOT_A_STATE', 'UNKNOWN', 0, datetime('now'), datetime('now'))"
            ))
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_resume_label_is_kept_after_the_resume_is_deleted(db_session):
    """DB-05: history still says which resume was used."""
    from app.domain.applications.entities import Application, ApplicationOutcomeStatus, WorkflowStateEnum
    from app.infrastructure.database.models.models import ApplicationModel, ResumeModel, UserModel
    from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository

    db_session.add(UserModel(id="u9", email="u9@t.com", hashed_password="x", is_active=True))
    db_session.add(JobModel(id="j9", source_id="s9", external_job_id="e9", title="T", company="C",
                            location="L", apply_url="https://x", raw_description="d"))
    db_session.add(ResumeModel(id="r9", user_id="u9", label="Backend CV 2026", target_role="Eng",
                               file_path="/tmp/x.pdf", file_name="x.pdf"))
    await db_session.flush()
    repo = SqlAlchemyApplicationRepository(db_session)
    await repo.save(Application(
        id="a9", user_id="u9", job_id="j9", resume_id="r9", idempotency_key="k9",
        workflow_state=WorkflowStateEnum.APPROVED, outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED,
    ))
    await db_session.commit()

    model = await db_session.get(ApplicationModel, "a9")
    assert model.resume_label_snapshot == "Backend CV 2026"
    # Simulate ON DELETE SET NULL after the resume is removed.
    model.resume_id = None
    await db_session.commit()
    assert (await db_session.get(ApplicationModel, "a9")).resume_label_snapshot == "Backend CV 2026"


@pytest.mark.asyncio
async def test_legacy_database_missing_new_columns_gets_them(empty_engine):
    # An old database made before the timezone and resume snapshot columns existed.
    async with empty_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE campaign_safety_policies DROP COLUMN timezone"))
        await conn.execute(text("ALTER TABLE applications DROP COLUMN resume_label_snapshot"))

    await run_migrations()

    async with empty_engine.connect() as conn:
        policy_cols = {r[1] for r in (await conn.execute(text("PRAGMA table_info(campaign_safety_policies)"))).all()}
        app_cols = {r[1] for r in (await conn.execute(text("PRAGMA table_info(applications)"))).all()}
    assert "timezone" in policy_cols and "resume_label_snapshot" in app_cols
    assert await _version(empty_engine) == "0007"
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_server_defaults_match_between_migrations_and_models(empty_engine):
    """IMP-051: compare_metadata ignores server defaults unless asked; ask for them."""
    await run_migrations()
    async with empty_engine.connect() as conn:
        diffs = await conn.run_sync(
            lambda c: compare_metadata(
                MigrationContext.configure(c, opts={"compare_server_default": True}), Base.metadata
            )
        )
    await empty_engine.dispose()
    server_default_diffs = [d for d in diffs if isinstance(d, list) or (isinstance(d, tuple) and "server_default" in d[0])]
    assert server_default_diffs == [], server_default_diffs


_INSERT_RUNNING = (
    "INSERT INTO campaign_executions (id, campaign_id, user_id, status, lease_version, started_at, updated_at, "
    "discovered_count, qualified_count, queued_count, submitted_count, failed_count) "
    "VALUES ('{id}', 'dup', 'u1', 'RUNNING', 1, '2026-01-01', '2026-01-01', 0, 0, 0, 0, 0)"
)
_GUARD = "uq_campaign_one_active_execution"


async def _guard_index_present(engine) -> bool:
    async with engine.connect() as conn:
        rows = (await conn.execute(text(f"SELECT name FROM sqlite_master WHERE name='{_GUARD}'"))).all()
    return bool(rows)


@pytest.mark.asyncio
async def test_guard_migration_creates_the_index_on_a_clean_database(empty_engine):
    await run_migrations()
    assert await _guard_index_present(empty_engine)
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_migration_path_leaves_existing_duplicate_active_executions_alone(empty_engine):
    """IMP-052: never end someone's execution to make an index fit; skip the index instead."""
    from alembic import command

    cfg = database._alembic_config()

    def upgrade_to_0004(c):
        cfg.attributes["connection"] = c
        command.upgrade(cfg, "0004")

    async with empty_engine.begin() as conn:
        await conn.run_sync(upgrade_to_0004)
        for i in (1, 2):
            await conn.execute(text(_INSERT_RUNNING.format(id=f"e{i}")))
    await run_migrations()  # applies 0005 for real
    async with empty_engine.connect() as conn:
        n = (await conn.execute(text("SELECT COUNT(*) FROM campaign_executions WHERE status='RUNNING'"))).scalar()
    assert n == 2  # data untouched
    assert not await _guard_index_present(empty_engine)  # skipped, not forced
    assert await _version(empty_engine) == "0007"
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_legacy_database_gets_the_guard_when_data_allows(empty_engine):
    async with empty_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(f"DROP INDEX {_GUARD}"))
    await run_migrations()  # legacy path: tables exist, no alembic_version
    assert await _guard_index_present(empty_engine)
    assert await _version(empty_engine) == "0007"
    await empty_engine.dispose()


@pytest.mark.asyncio
async def test_legacy_database_with_duplicate_active_executions_still_starts(empty_engine):
    async with empty_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text(f"DROP INDEX {_GUARD}"))
        for i in (1, 2):
            await conn.execute(text(_INSERT_RUNNING.format(id=f"e{i}")))
    await run_migrations()  # must not crash the app on startup
    async with empty_engine.connect() as conn:
        n = (await conn.execute(text("SELECT COUNT(*) FROM campaign_executions WHERE status='RUNNING'"))).scalar()
    assert n == 2
    assert not await _guard_index_present(empty_engine)
    await empty_engine.dispose()
