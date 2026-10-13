import asyncio
import os
import tempfile

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Tests are a dev-like environment: settings generate throw-away secrets.
os.environ.setdefault("APP_ENV", "test")
# Rate limiting is tested explicitly; keep it off so other tests can log in freely.
os.environ.setdefault("AUTH_RATE_LIMIT_ATTEMPTS", "0")
# Controlled-browser tests open pages on localhost; the URL guard has its own tests.
os.environ.setdefault("ALLOW_PRIVATE_APPLY_URLS", "true")

import app.core.database as database
from app.core.database import Base, get_db_session
from main import app


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "file_db: run the test on a temporary file DB so every session gets its "
        "own connection (needed for real concurrency tests).",
    )


def _make_engine(use_file: bool):
    if use_file:
        path = tempfile.mkdtemp(prefix="autoapply_tests_") + "/test.db"
        return create_async_engine(
            f"sqlite+aiosqlite:///{path}",
            connect_args={"check_same_thread": False, "timeout": 30},
            poolclass=NullPool,
        )
    # One shared in-memory connection: fast and isolated.
    return create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def test_database(request, monkeypatch):
    """Create a fresh test DB and point ALL code at it.

    Production code (orchestrator, workers, background tasks) opens
    `AsyncSessionLocal()` directly, so we patch that factory as well as
    `get_db_session`, otherwise those code paths would touch ./app.db.
    """
    engine = _make_engine(bool(request.node.get_closest_marker("file_db")))
    factory = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "AsyncSessionLocal", factory)
    try:
        import app.workers.matching_worker as matching_worker

        monkeypatch.setattr(matching_worker, "AsyncSessionLocal", factory)
    except ImportError:
        pass

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield factory

    # Stop pipelines a test started, then drop the DB. Disposing the engine
    # closes its connections (a drop_all could wait behind a cancelled task).
    from app.application.automation.orchestrator import orchestrator

    await orchestrator.cancel_background_tasks()
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_database) -> AsyncSession:
    async with test_database() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_db():
        # Mirror app.core.database.get_db_session: commit when the request ends,
        # so one request's writes are visible to other connections.
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    app.dependency_overrides[get_db_session] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
