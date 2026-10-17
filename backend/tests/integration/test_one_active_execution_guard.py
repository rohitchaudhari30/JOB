"""IMP-052: the database itself refuses a second active execution for one campaign."""
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.models import CampaignExecutionModel
from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignExecutionRepository


def _row(exec_id: str, campaign_id: str, status: str) -> CampaignExecutionModel:
    return CampaignExecutionModel(
        id=exec_id, campaign_id=campaign_id, user_id="u1", status=status, started_at=datetime.now(timezone.utc)
    )


@pytest.mark.asyncio
async def test_database_refuses_a_second_active_execution(db_session: AsyncSession):
    db_session.add(_row("e1", "c1", "RUNNING"))
    await db_session.commit()
    db_session.add(_row("e2", "c1", "PAUSED_OTP"))  # any active state counts
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.asyncio
async def test_finished_executions_do_not_block_a_new_active_one(db_session: AsyncSession):
    db_session.add_all([_row("e1", "c2", "COMPLETED"), _row("e2", "c2", "FAILED"), _row("e3", "c2", "ABORTED")])
    await db_session.commit()
    db_session.add(_row("e4", "c2", "RUNNING"))
    await db_session.commit()  # no error


@pytest.mark.asyncio
async def test_different_campaigns_can_each_have_an_active_execution(db_session: AsyncSession):
    db_session.add_all([_row("e1", "c3", "RUNNING"), _row("e2", "c4", "RUNNING")])
    await db_session.commit()


@pytest.mark.asyncio
async def test_acquire_returns_the_winner_when_it_loses_the_insert_race(db_session: AsyncSession, monkeypatch):
    """Simulate two requests passing the 'is there an active one?' check at once."""
    repo = SqlAlchemyCampaignExecutionRepository(db_session)
    winner, created = await repo.acquire_or_get_active_execution(campaign_id="c5", user_id="u1", worker_id="A")
    assert created is True

    real_execute = db_session.execute
    calls = {"n": 0}

    async def blind_first_lookup(stmt, *a, **kw):
        calls["n"] += 1
        if calls["n"] == 1:  # the loser's initial check sees nothing, as if the winner had not committed yet
            class Empty:
                def scalars(self):
                    class S:
                        def first(self):
                            return None
                    return S()
            return Empty()
        return await real_execute(stmt, *a, **kw)

    monkeypatch.setattr(db_session, "execute", blind_first_lookup)
    loser_exec, loser_created = await repo.acquire_or_get_active_execution(
        campaign_id="c5", user_id="u1", worker_id="B"
    )
    assert loser_created is False
    assert loser_exec.id == winner.id
    assert loser_exec.worker_id == "A"
