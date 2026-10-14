import pytest
from sqlalchemy import select

from app.core import database
from app.infrastructure.database.models.models import AutomationRunModel, UserModel


@pytest.mark.asyncio
async def test_runs_left_active_by_a_restart_are_marked_failed():
    async with database.AsyncSessionLocal() as session:
        session.add(UserModel(id="u1", email="orphan@example.com", hashed_password="x", full_name="Orphan"))
        await session.flush()
        session.add(AutomationRunModel(id="r-running", user_id="u1", status="RUNNING"))
        session.add(AutomationRunModel(id="r-done", user_id="u1", status="COMPLETED"))
        await session.commit()

    assert await database.reconcile_orphaned_runs() == 1

    async with database.AsyncSessionLocal() as session:
        rows = {r.id: r for r in (await session.scalars(select(AutomationRunModel))).all()}
    assert rows["r-running"].status == "FAILED"
    assert "restarted" in rows["r-running"].error_message
    assert rows["r-done"].status == "COMPLETED"
