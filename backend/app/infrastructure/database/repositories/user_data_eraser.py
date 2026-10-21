"""Delete everything that belongs to one user (PRV-01).

SQLite does not enforce ON DELETE CASCADE unless foreign keys are switched on, so
this walks the table metadata and deletes explicitly. A table is "owned" if it has
a user_id column, or if it points (ON DELETE CASCADE) at an owned table.
Shared tables such as jobs and job_sources are never touched.
"""
import logging
import os
import shutil

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import Base
from app.infrastructure.database.models.models import ApplicationModel, ResumeModel, TailoredResumeModel

logger = logging.getLogger(__name__)


def _owned_table_filters(user_id: str) -> dict:
    users = Base.metadata.tables["users"]
    filters = {}
    for table in Base.metadata.sorted_tables:
        if table is users or "user_id" not in table.c:
            continue
        user_fk = next((fk for fk in table.c.user_id.foreign_keys if fk.column.table is users), None)
        if user_fk is not None and user_fk.ondelete == "SET NULL":
            continue  # handled separately: anonymised, not deleted
        filters[table] = table.c.user_id == user_id

    changed = True
    while changed:
        changed = False
        for table in Base.metadata.sorted_tables:
            if table in filters or table is users:
                continue
            for fk in table.foreign_keys:
                parent = fk.column.table
                if parent in filters and fk.ondelete == "CASCADE":
                    filters[table] = fk.parent.in_(select(fk.column).where(filters[parent]))
                    changed = True
                    break
    return filters


async def _files_to_remove(session: AsyncSession, user_id: str) -> list[str]:
    paths = []
    resume_rows = await session.execute(select(ResumeModel.file_path).where(ResumeModel.user_id == user_id))
    paths += [p for (p,) in resume_rows if p]
    tailored_rows = await session.execute(
        select(TailoredResumeModel.file_path, TailoredResumeModel.pdf_file_path).where(TailoredResumeModel.user_id == user_id)
    )
    for docx_path, pdf_path in tailored_rows:
        paths += [p for p in (docx_path, pdf_path) if p]
    app_rows = await session.execute(
        select(ApplicationModel.screenshot_file_path, ApplicationModel.trace_file_path).where(
            ApplicationModel.user_id == user_id
        )
    )
    for shot, trace in app_rows:
        paths += [p for p in (shot, trace) if p]
    return paths


async def erase_user(session: AsyncSession, user_id: str) -> None:
    """Delete the user's rows and files. The caller commits."""
    files = await _files_to_remove(session, user_id)
    users = Base.metadata.tables["users"]

    # Anonymise rows we keep for system-wide statistics (e.g. AI request logs).
    for table in Base.metadata.sorted_tables:
        if "user_id" in table.c and table is not users:
            fk = next((f for f in table.c.user_id.foreign_keys if f.column.table is users), None)
            if fk is not None and fk.ondelete == "SET NULL":
                await session.execute(update(table).where(table.c.user_id == user_id).values(user_id=None))

    filters = _owned_table_filters(user_id)
    for table in reversed(Base.metadata.sorted_tables):  # children before parents
        if table in filters:
            await session.execute(delete(table).where(filters[table]))
    await session.execute(delete(users).where(users.c.id == user_id))
    await session.flush()

    # Files last: if the database delete failed we would not want to lose the files.
    for path in files:
        try:
            os.remove(path)
        except OSError:
            pass
    shutil.rmtree(os.path.join(settings.STORAGE_DIR, "resumes", user_id), ignore_errors=True)
    shutil.rmtree(os.path.join(settings.STORAGE_DIR, "tailored_resumes", user_id), ignore_errors=True)
