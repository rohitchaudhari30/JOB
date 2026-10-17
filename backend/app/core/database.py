from datetime import datetime, timezone
from collections.abc import AsyncGenerator
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
from app.core.logging import logger


class Base(DeclarativeBase):
    """Base declarative class for all SQLAlchemy models."""
    pass


# Connect arguments for SQLite WAL mode & busy timeout
connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    connect_args = {"check_same_thread": False, "timeout": 30}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
    future=True,
)


# SQLite PRAGMA hook for WAL mode & timeout
if "sqlite" in settings.DATABASE_URL:
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA busy_timeout=30000;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
        cursor.execute("PRAGMA temp_store=MEMORY;")
        cursor.execute("PRAGMA cache_size=-64000;")
        cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for yielding an active async database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def _migrate_sqlite_columns():
    """ONE-TIME upgrade for databases created before Alembic existed.

    It runs only for such legacy databases (see run_migrations). New schema
    changes belong in migrations/versions, never here.
    """
    if "sqlite" not in settings.DATABASE_URL:
        return
    try:
        from sqlalchemy import text
        async with engine.begin() as conn:
            # Check jobs table
            res = await conn.execute(text("PRAGMA table_info(jobs)"))
            jobs_cols = {row[1] for row in res.fetchall()}
            if jobs_cols:
                new_job_cols = [
                    ("first_seen_at", "DATETIME"),
                    ("last_seen_at", "DATETIME"),
                    ("raw_posted_text", "VARCHAR"),
                    ("posted_at_precision", "VARCHAR DEFAULT 'UNKNOWN'"),
                    ("posted_at_source", "VARCHAR DEFAULT 'scraped_text'"),
                    ("freshness_bucket", "VARCHAR DEFAULT 'UNKNOWN'"),
                    ("freshness_score", "FLOAT DEFAULT 0.0"),
                    ("canonical_job_key", "VARCHAR(64)"),
                    ("canonical_confidence", "VARCHAR(32) DEFAULT 'PLATFORM_EXACT'"),
                    ("updated_at", "DATETIME"),
                ]
                for col_name, col_type in new_job_cols:
                    if col_name not in jobs_cols:
                        await conn.execute(text(f"ALTER TABLE jobs ADD COLUMN {col_name} {col_type}"))
                # Older upgrades wrote lowercase enums and a numeric confidence. (DB-02)
                await conn.execute(text("UPDATE jobs SET posted_at_precision = UPPER(posted_at_precision) WHERE posted_at_precision != UPPER(posted_at_precision)"))
                await conn.execute(text("UPDATE jobs SET freshness_bucket = UPPER(freshness_bucket) WHERE freshness_bucket != UPPER(freshness_bucket)"))
                await conn.execute(text("UPDATE jobs SET canonical_confidence = 'PLATFORM_EXACT' WHERE canonical_confidence IS NULL OR canonical_confidence GLOB '[0-9]*'"))
                await conn.execute(text("""
                    UPDATE jobs 
                    SET first_seen_at = COALESCE(created_at, datetime('now')),
                        last_seen_at = COALESCE(created_at, datetime('now')),
                        updated_at = COALESCE(created_at, datetime('now')),
                        freshness_bucket = 'unknown',
                        freshness_score = 50.0
                    WHERE first_seen_at IS NULL
                """))

            # Check match_results table
            res = await conn.execute(text("PRAGMA table_info(match_results)"))
            match_cols = {row[1] for row in res.fetchall()}
            if match_cols:
                new_match_cols = [
                    ("freshness_score", "FLOAT DEFAULT 50.0"),
                    ("evaluation_key", "VARCHAR(64)"),
                    ("match_score", "FLOAT"),
                    ("recommendation_score", "FLOAT"),
                    ("experience_score", "FLOAT"),
                    ("role_title_score", "FLOAT"),
                    ("location_score", "FLOAT"),
                    ("salary_score", "FLOAT"),
                    ("ai_score", "FLOAT"),
                    ("resume_version", "INTEGER"),
                    ("resume_snapshot_hash", "VARCHAR(64)"),
                    ("profile_version", "INTEGER"),
                    ("profile_snapshot_hash", "VARCHAR(64)"),
                    ("job_snapshot_hash", "VARCHAR(64)"),
                    ("matching_engine_version", "VARCHAR(32)"),
                    ("matching_config_version", "VARCHAR(32)"),
                    ("prompt_version", "VARCHAR(32)"),
                    ("embedding_model", "VARCHAR(64)"),
                    ("embedding_version", "VARCHAR(32)"),
                    ("recommendation_reasons", "TEXT"),
                    ("blocking_reasons", "TEXT"),
                    ("breakdown_json", "TEXT"),
                    ("ai_model", "VARCHAR(64)"),
                    ("duration_ms", "INTEGER"),
                ]
                for col_name, col_type in new_match_cols:
                    if col_name not in match_cols:
                        await conn.execute(text(f"ALTER TABLE match_results ADD COLUMN {col_name} {col_type}"))

            # Check browser_sessions table
            res = await conn.execute(text("PRAGMA table_info(browser_sessions)"))
            sess_cols = {row[1] for row in res.fetchall()}
            if sess_cols and "connection_id" not in sess_cols:
                await conn.execute(text("ALTER TABLE browser_sessions ADD COLUMN connection_id VARCHAR(36)"))
            if sess_cols and "last_used_at" not in sess_cols:
                await conn.execute(text("ALTER TABLE browser_sessions ADD COLUMN last_used_at DATETIME"))

            # Check campaign_executions table
            res = await conn.execute(text("PRAGMA table_info(campaign_executions)"))
            camp_exec_cols = {row[1] for row in res.fetchall()}
            if camp_exec_cols:
                new_exec_cols = [
                    ("worker_id", "VARCHAR(64) DEFAULT 'worker-1'"),
                    ("heartbeat_at", "DATETIME"),
                    ("lease_expires_at", "DATETIME"),
                    ("lease_version", "INTEGER DEFAULT 1 NOT NULL"),
                    ("updated_at", "DATETIME"),
                ]
                for col_name, col_type in new_exec_cols:
                    if col_name not in camp_exec_cols:
                        await conn.execute(text(f"ALTER TABLE campaign_executions ADD COLUMN {col_name} {col_type}"))

            # Check campaign_job_items table
            res = await conn.execute(text("PRAGMA table_info(campaign_job_items)"))
            camp_item_cols = {row[1] for row in res.fetchall()}
            if camp_item_cols:
                new_item_cols = [
                    ("retry_count", "INTEGER DEFAULT 0"),
                    ("error_category", "VARCHAR(64)"),
                    ("next_retry_at", "DATETIME"),
                    ("last_error", "TEXT"),
                ]
                for col_name, col_type in new_item_cols:
                    if col_name not in camp_item_cols:
                        await conn.execute(text(f"ALTER TABLE campaign_job_items ADD COLUMN {col_name} {col_type}"))

            # Check applications table
            res = await conn.execute(text("PRAGMA table_info(applications)"))
            app_cols = {row[1] for row in res.fetchall()}
            if app_cols:
                new_app_cols = [
                    ("outcome_status", "VARCHAR(32) DEFAULT 'NOT_SUBMITTED'"),
                    ("retry_count", "INTEGER DEFAULT 0"),
                    ("error_category", "VARCHAR(64)"),
                    ("next_retry_at", "DATETIME"),
                    ("current_attempt_id", "VARCHAR(64)"),
                ]
                for col_name, col_type in new_app_cols:
                    if col_name not in app_cols:
                        await conn.execute(text(f"ALTER TABLE applications ADD COLUMN {col_name} {col_type}"))

            # Dynamic safety reconciliation across all declared tables in Base.metadata
            from app.infrastructure.database.models.models import Base as ModelsBase
            all_tables_res = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            existing_tables = {row[0] for row in all_tables_res.fetchall()}

            for tbl_name, tbl_obj in ModelsBase.metadata.tables.items():
                if tbl_name not in existing_tables:
                    continue
                tbl_info_res = await conn.execute(text(f"PRAGMA table_info({tbl_name})"))
                current_cols = {row[1] for row in tbl_info_res.fetchall()}
                for col in tbl_obj.columns:
                    if col.name not in current_cols:
                        col_type_str = "VARCHAR(255)"
                        raw_type = str(col.type).upper()
                        if "INT" in raw_type:
                            col_type_str = "INTEGER"
                        elif "FLOAT" in raw_type or "NUMERIC" in raw_type:
                            col_type_str = "FLOAT"
                        elif "BOOL" in raw_type:
                            col_type_str = "BOOLEAN"
                        elif "DATETIME" in raw_type:
                            col_type_str = "DATETIME"
                        elif "TEXT" in raw_type or "JSON" in raw_type:
                            col_type_str = "TEXT"

                        default_clause = ""
                        if col.default is not None and hasattr(col.default, "arg") and not callable(col.default.arg):
                            arg = col.default.arg
                            if isinstance(arg, (int, float)):
                                default_clause = f" DEFAULT {arg}"
                            elif isinstance(arg, bool):
                                default_clause = f" DEFAULT {1 if arg else 0}"
                            elif isinstance(arg, str):
                                default_clause = f" DEFAULT '{arg}'"

                        try:
                            await conn.execute(text(f"ALTER TABLE {tbl_name} ADD COLUMN {col.name} {col_type_str}{default_clause}"))
                            logger.info(f"Auto-migrated missing column: {tbl_name}.{col.name} ({col_type_str})")
                        except Exception as auto_col_err:
                            logger.debug(f"Column add notice for {tbl_name}.{col.name}: {auto_col_err}")

            # Ensure automation_events has unique index on (run_id, seq) after cleaning any duplicates/nulls
            if "automation_events" in existing_tables:
                # Check if sequence repair is needed (null/0 sequences or duplicates)
                dup_or_null_check = await conn.execute(text("""
                    SELECT 1 FROM automation_events WHERE seq IS NULL OR seq <= 0
                    UNION ALL
                    SELECT 1 FROM automation_events GROUP BY run_id, seq HAVING COUNT(*) > 1
                """))
                if dup_or_null_check.fetchall():
                    logger.info("Resolving invalid, non-contiguous, or duplicate sequence numbers in automation_events...")
                    # Fetch all distinct run_ids to repair sequentially
                    runs_res = await conn.execute(text("SELECT DISTINCT run_id FROM automation_events"))
                    run_ids = [r[0] for r in runs_res.fetchall()]

                    for rid in run_ids:
                        rows_res = await conn.execute(text("""
                            SELECT id, seq, created_at, rowid 
                            FROM automation_events 
                            WHERE run_id = :rid
                            ORDER BY 
                                created_at ASC,
                                CASE WHEN seq IS NOT NULL AND seq > 0 THEN seq ELSE 999999999 END ASC,
                                rowid ASC
                        """), {"rid": rid})
                        event_rows = rows_res.fetchall()
                        current_seqs = [r[1] for r in event_rows]
                        expected_seqs = list(range(1, len(event_rows) + 1))
                        if current_seqs != expected_seqs:
                            for new_seq, (row_id, _, _, _) in enumerate(event_rows, start=1):
                                await conn.execute(text("""
                                    UPDATE automation_events 
                                    SET seq = :new_seq 
                                    WHERE id = :row_id
                                """), {"new_seq": new_seq, "row_id": row_id})

                # Create unique index if not already present
                await conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_run_event_seq
                    ON automation_events (run_id, seq)
                """))

                # 4. Synchronize last_event_seq in automation_runs to match max(seq)
                if "automation_runs" in existing_tables:
                    await conn.execute(text("""
                        UPDATE automation_runs
                        SET last_event_seq = COALESCE(
                            (SELECT MAX(seq) FROM automation_events WHERE automation_events.run_id = automation_runs.id),
                            0
                        )
                    """))

            # Ensure jobs has unique index on canonical_job_key for active records
            if "jobs" in existing_tables:
                # Detect if any conflicting active jobs exist on canonical_job_key before indexing
                conflicts_res = await conn.execute(text("""
                    SELECT canonical_job_key, COUNT(*) 
                    FROM jobs 
                    WHERE canonical_job_key IS NOT NULL AND is_active = 1
                    GROUP BY canonical_job_key 
                    HAVING COUNT(*) > 1
                """))
                conflicts = conflicts_res.fetchall()
                if conflicts:
                    logger.warning(f"Found {len(conflicts)} canonical key duplicate groups in existing jobs; deactivating older duplicates to enforce uniqueness...")
                    for c_key, _ in conflicts:
                        dup_ids_res = await conn.execute(text("""
                            SELECT id FROM jobs 
                            WHERE canonical_job_key = :c_key AND is_active = 1
                            ORDER BY created_at ASC
                        """), {"c_key": c_key})
                        dup_ids = [r[0] for r in dup_ids_res.fetchall()]
                        if len(dup_ids) <= 1:
                            continue
                        master_id = dup_ids[0]
                        # Transactionally preserve dependent records across all referencing tables
                        for stale_id in dup_ids[1:]:
                            # 1. Update match_results: re-point to master_id if user doesn't already have one
                            if "match_results" in existing_tables:
                                await conn.execute(text("""
                                    UPDATE match_results 
                                    SET job_id = :master_id 
                                    WHERE job_id = :stale_id 
                                      AND user_id NOT IN (SELECT user_id FROM match_results WHERE job_id = :master_id)
                                """), {"master_id": master_id, "stale_id": stale_id})
                            # 2. Update applications: re-point to master_id if user hasn't applied to master_id
                            if "applications" in existing_tables:
                                await conn.execute(text("""
                                    UPDATE applications 
                                    SET job_id = :master_id 
                                    WHERE job_id = :stale_id 
                                      AND user_id NOT IN (SELECT user_id FROM applications WHERE job_id = :master_id)
                                """), {"master_id": master_id, "stale_id": stale_id})
                            # 3. Update campaign_job_items: re-point to master_id if execution doesn't have it
                            if "campaign_job_items" in existing_tables:
                                await conn.execute(text("""
                                    UPDATE campaign_job_items 
                                    SET job_id = :master_id 
                                    WHERE job_id = :stale_id 
                                      AND execution_id NOT IN (SELECT execution_id FROM campaign_job_items WHERE job_id = :master_id)
                                """), {"master_id": master_id, "stale_id": stale_id})
                            # 4. Update campaign_quota_reservations: re-point to master_id
                            if "campaign_quota_reservations" in existing_tables:
                                await conn.execute(text("""
                                    UPDATE campaign_quota_reservations 
                                    SET job_id = :master_id 
                                    WHERE job_id = :stale_id 
                                      AND campaign_id NOT IN (SELECT campaign_id FROM campaign_quota_reservations WHERE job_id = :master_id)
                                """), {"master_id": master_id, "stale_id": stale_id})
                            # 5. Update matching_tasks: re-point to master_id
                            if "matching_tasks" in existing_tables:
                                await conn.execute(text("""
                                    UPDATE matching_tasks 
                                    SET job_id = :master_id 
                                    WHERE job_id = :stale_id 
                                      AND user_id NOT IN (SELECT user_id FROM matching_tasks WHERE job_id = :master_id)
                                """), {"master_id": master_id, "stale_id": stale_id})
                            # Soft-deactivate stale duplicate record after referencing tables are merged
                            await conn.execute(text("UPDATE jobs SET is_active = 0 WHERE id = :stale_id"), {"stale_id": stale_id})

                await conn.execute(text("""
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_job_canonical_key
                    ON jobs (canonical_job_key)
                    WHERE canonical_job_key IS NOT NULL AND is_active = 1
                """))
    except Exception as e:
        # A half-applied legacy repair must stop startup, not be ignored. (DB-01)
        logger.error(f"SQLite legacy schema upgrade failed: {e}", exc_info=True)
        raise


def _add_missing_columns(connection) -> None:
    """Legacy databases: add model columns that the old routine never knew about.

    Only simple columns are handled (nullable, or with a plain default). Anything
    else needs a proper migration, so it raises instead of guessing.
    """
    from sqlalchemy import inspect

    inspector = inspect(connection)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            sql_type = column.type.compile(connection.dialect)
            default = getattr(getattr(column, "default", None), "arg", None)
            if column.nullable:
                clause = ""
            elif isinstance(default, (str, int, float)) and not callable(default):
                literal = f"'{default}'" if isinstance(default, str) else str(default)
                clause = f" NOT NULL DEFAULT {literal}"
            else:
                raise RuntimeError(f"Cannot auto-add NOT NULL column {table.name}.{column.name}; write a migration.")
            connection.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {sql_type}{clause}'))
            logger.info("Added missing column %s.%s", table.name, column.name)


def _alembic_config():
    from pathlib import Path

    from alembic.config import Config

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "migrations"))
    return cfg


def _ensure_one_active_execution_index(connection) -> None:
    """IMP-052 for legacy databases (they are stamped at head, so migration 0005 never runs for them).

    Creates the one-active-execution-per-campaign index unless it exists. If the data already breaks
    the rule it logs the campaign ids and leaves everything alone: deciding which execution to end
    is a person's call, and the application-level check keeps working either way.
    """
    from sqlalchemy import inspect, text

    from app.infrastructure.database.models.models import ACTIVE_EXECUTION_WHERE

    name = "uq_campaign_one_active_execution"
    inspector = inspect(connection)
    if "campaign_executions" not in inspector.get_table_names():
        return
    if name in {i["name"] for i in inspector.get_indexes("campaign_executions")}:
        return
    dupes = connection.execute(
        text(
            "SELECT campaign_id FROM campaign_executions "
            f"WHERE {ACTIVE_EXECUTION_WHERE} GROUP BY campaign_id HAVING COUNT(*) > 1"
        )
    ).fetchall()
    if dupes:
        logger.warning(
            "Skipping %s: campaigns with more than one active execution: %s. "
            "End the extra executions, then restart to create it.",
            name,
            [row[0] for row in dupes],
        )
        return
    connection.execute(
        text(f"CREATE UNIQUE INDEX {name} ON campaign_executions (campaign_id) WHERE {ACTIVE_EXECUTION_WHERE}")
    )


def _alembic_run(connection, action: str) -> None:
    from alembic import command

    cfg = _alembic_config()
    cfg.attributes["connection"] = connection
    if action == "stamp":
        command.stamp(cfg, "head")
    else:
        command.upgrade(cfg, "head")


async def run_migrations() -> None:
    """Bring the database to the latest schema with Alembic. (DB-01)

    - empty database          -> run all migrations
    - already under Alembic   -> run the pending ones
    - legacy database (tables but no alembic_version, created by the old
      create_all + ALTER routine) -> repair it once, add missing tables, then
      mark it as being at the current version.
    """
    from sqlalchemy import inspect

    import app.infrastructure.database.models.models  # noqa: F401  (registers tables)

    async with engine.connect() as conn:
        tables = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))

    if tables and "alembic_version" not in tables:
        logger.info("Legacy database detected: running one-time upgrade, then adopting Alembic.")
        await _migrate_sqlite_columns()
        async with engine.connect() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(_add_missing_columns)
            await conn.run_sync(_ensure_one_active_execution_index)
            await conn.run_sync(_alembic_run, "stamp")
            await conn.commit()
    else:
        async with engine.connect() as conn:
            await conn.run_sync(_alembic_run, "upgrade")
            await conn.commit()


async def init_db():
    """Migrates the database and (optionally, dev only) seeds a demo account."""
    await run_migrations()
    logger.info("Database schema is up to date.")

    # Seed demo account only when explicitly enabled in a dev environment (SEC-02).
    if not (settings.SEED_DEMO_USER and settings.is_dev_environment):
        return
    try:
        from sqlalchemy import select
        from app.core.security import get_password_hash
        from app.infrastructure.database.models.models import (
            CandidateProfileModel,
            CandidateSkillModel,
            ExperienceModel,
            ResumeModel,
            UserModel,
        )

        async with AsyncSessionLocal() as session:
            demo_user = await session.scalar(
                select(UserModel).where(UserModel.email == "demo.engineer@example.com")
            )
            if not demo_user:
                demo_user = UserModel(
                    email="demo.engineer@example.com",
                    hashed_password=get_password_hash("SecurePassword123!"),
                    full_name="Demo User",
                    is_active=True,
                )
                session.add(demo_user)
                await session.commit()
                logger.info("Base user account [demo.engineer@example.com] initialized.")
    except Exception as e:
        logger.warning(f"User account auto-init notice: {e}")


async def reconcile_orphaned_runs() -> int:
    """
    Runs live inside the API process, so any run still marked active when the
    server starts was cut off by a restart. Mark those as FAILED (AUT-19).
    """
    from sqlalchemy import update

    from app.infrastructure.database.models.models import AutomationRunModel

    active_states = ["CREATED", "STARTING", "RUNNING", "PAUSED", "STOPPING"]
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            update(AutomationRunModel)
            .where(AutomationRunModel.status.in_(active_states))
            .values(
                status="FAILED",
                error_message="Interrupted because the server restarted.",
                finished_at=datetime.now(timezone.utc),
            )
        )
        await session.commit()
    count = result.rowcount or 0
    if count:
        logger.warning("Marked %d orphaned automation run(s) as FAILED after restart", count)
    return count
