"""Alembic environment.

Two ways in:
  * the app (init_db) passes an open connection in config.attributes["connection"];
  * the CLI (`alembic upgrade head`) builds its own engine from DATABASE_URL.
"""
import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.database import Base
import app.infrastructure.database.models.models  # noqa: F401  (registers all tables)

config = context.config
target_metadata = Base.metadata


def _configure_and_run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,  # lets SQLite alter tables the safe way
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_from_cli() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.connect() as connection:
        await connection.run_sync(_configure_and_run)
        await connection.commit()
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=settings.DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    existing = config.attributes.get("connection")
    if existing is not None:
        _configure_and_run(existing)
    else:
        asyncio.run(_run_from_cli())
