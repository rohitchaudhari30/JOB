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
    """Ensures existing SQLite tables have newly added columns in development."""
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
                    ("posted_at_precision", "VARCHAR DEFAULT 'unknown'"),
                    ("posted_at_source", "VARCHAR DEFAULT 'scraped_text'"),
                    ("freshness_bucket", "VARCHAR DEFAULT 'unknown'"),
                    ("freshness_score", "FLOAT DEFAULT 50.0"),
                    ("canonical_job_key", "VARCHAR(64)"),
                    ("canonical_confidence", "FLOAT DEFAULT 1.0"),
                    ("updated_at", "DATETIME"),
                ]
                for col_name, col_type in new_job_cols:
                    if col_name not in jobs_cols:
                        await conn.execute(text(f"ALTER TABLE jobs ADD COLUMN {col_name} {col_type}"))
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
    except Exception as e:
        logger.warning(f"SQLite auto-migration notice: {e}")


async def init_db():
    """Initializes database tables and seeds demo account for local development."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _migrate_sqlite_columns()
    logger.info("Database schemas initialized.")

    # Seed demo account if not exists
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
