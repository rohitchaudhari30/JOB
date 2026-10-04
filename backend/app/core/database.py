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
    connect_args = {"check_same_thread": False, "timeout": 15}

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
        cursor.execute("PRAGMA busy_timeout=5000;")
        cursor.execute("PRAGMA synchronous=NORMAL;")
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
            if match_cols and "freshness_score" not in match_cols:
                await conn.execute(text("ALTER TABLE match_results ADD COLUMN freshness_score FLOAT"))

            # Check browser_sessions table
            res = await conn.execute(text("PRAGMA table_info(browser_sessions)"))
            sess_cols = {row[1] for row in res.fetchall()}
            if sess_cols and "connection_id" not in sess_cols:
                await conn.execute(text("ALTER TABLE browser_sessions ADD COLUMN connection_id VARCHAR(36)"))
            if sess_cols and "last_used_at" not in sess_cols:
                await conn.execute(text("ALTER TABLE browser_sessions ADD COLUMN last_used_at DATETIME"))
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
