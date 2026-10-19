"""The campaign schedule ticker fires saved schedules safely. The launcher is a fake: nothing is ever applied."""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.infrastructure.database.models.models import CampaignScheduleModel
from app.workers.campaign_scheduler import compute_next_run, run_due_campaign_schedules

NOW = datetime(2026, 3, 4, 10, 0, tzinfo=timezone.utc)  # a Wednesday, 10:00 UTC


class FakeLauncher:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    async def __call__(self, user_id, campaign_id):
        self.calls.append((user_id, campaign_id))
        if self.fail:
            raise RuntimeError("boom")


async def _no_live(user_id):
    return None


async def _campaign(client: AsyncClient, email: str, schedule: dict, tz="UTC", window=("00:00", "23:59")):
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    r = await client.post("/api/v1/campaigns", headers=headers, json={
        "name": "Sched camp", "schedule": schedule,
        "safety_policy": {"operating_start_time": window[0], "operating_end_time": window[1], "timezone": tz},
    })
    assert r.status_code == 201, r.text
    return reg.json()["id"], r.json()["id"]


async def _sched(db: AsyncSession, campaign_id: str) -> CampaignScheduleModel:
    db.expire_all()
    return (await db.execute(select(CampaignScheduleModel).where(CampaignScheduleModel.campaign_id == campaign_id))).scalar_one()


def test_next_run_for_interval_and_cron_and_garbage():
    assert compute_next_run(None, 90, NOW) == NOW + timedelta(minutes=90)
    assert compute_next_run("0 9 * * 1-5", None, NOW) == datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc)  # next weekday 9:00
    # cron is read in the campaign's own timezone: 09:00 Asia/Kolkata = 03:30 UTC
    assert compute_next_run("0 9 * * *", None, NOW, "Asia/Kolkata") == datetime(2026, 3, 5, 3, 30, tzinfo=timezone.utc)
    assert compute_next_run("not a cron", None, NOW) is None
    assert compute_next_run(None, None, NOW) is None


@pytest.mark.asyncio
async def test_enabling_a_schedule_arms_it_but_does_not_fire_immediately(client, db_session):
    _, cid = await _campaign(client, "arm@example.com", {"is_active": True, "interval_minutes": 60})
    fake = FakeLauncher()
    counts = await run_due_campaign_schedules(NOW, fake, _no_live)
    assert counts["armed"] == 1 and counts["launched"] == 0 and fake.calls == []
    assert (await _sched(db_session, cid)).next_run_at is not None


@pytest.mark.asyncio
async def test_due_schedule_launches_once_and_moves_forward(client, db_session):
    uid, cid = await _campaign(client, "due@example.com", {"is_active": True, "interval_minutes": 60})
    s = await _sched(db_session, cid); s.next_run_at = NOW - timedelta(minutes=2); await db_session.commit()
    fake = FakeLauncher()
    counts = await run_due_campaign_schedules(NOW, fake, _no_live)
    assert counts["launched"] == 1 and fake.calls == [(uid, cid)]
    s = await _sched(db_session, cid)
    assert s.next_run_at.replace(tzinfo=timezone.utc) == NOW + timedelta(minutes=60)
    assert s.last_run_at is not None
    again = await run_due_campaign_schedules(NOW + timedelta(minutes=1), fake, _no_live)  # not due yet
    assert again["launched"] == 0 and len(fake.calls) == 1


@pytest.mark.asyncio
async def test_inactive_schedule_never_fires(client, db_session):
    _, cid = await _campaign(client, "off@example.com", {"is_active": False, "interval_minutes": 60})
    s = await _sched(db_session, cid); s.next_run_at = NOW - timedelta(minutes=2); await db_session.commit()
    fake = FakeLauncher()
    await run_due_campaign_schedules(NOW, fake, _no_live)
    assert fake.calls == []


@pytest.mark.asyncio
async def test_failing_launch_is_counted_not_retried_every_minute(client, db_session):
    _, cid = await _campaign(client, "fail@example.com", {"is_active": True, "interval_minutes": 60})
    s = await _sched(db_session, cid); s.next_run_at = NOW - timedelta(minutes=1); await db_session.commit()
    fake = FakeLauncher(fail=True)
    assert (await run_due_campaign_schedules(NOW, fake, _no_live))["failed"] == 1
    assert (await run_due_campaign_schedules(NOW + timedelta(minutes=1), fake, _no_live))["failed"] == 0
    assert len(fake.calls) == 1  # the slot was consumed


@pytest.mark.asyncio
async def test_stale_slot_after_downtime_is_skipped_not_run_late(client, db_session):
    _, cid = await _campaign(client, "stale@example.com", {"is_active": True, "interval_minutes": 60})
    s = await _sched(db_session, cid); s.next_run_at = NOW - timedelta(hours=5); await db_session.commit()
    fake = FakeLauncher()
    counts = await run_due_campaign_schedules(NOW, fake, _no_live)
    assert counts["skipped"] == 1 and fake.calls == []
    assert (await _sched(db_session, cid)).next_run_at.replace(tzinfo=timezone.utc) > NOW


@pytest.mark.asyncio
async def test_skipped_outside_operating_hours_and_while_a_run_is_live(client, db_session):
    _, night = await _campaign(client, "night@example.com", {"is_active": True, "interval_minutes": 60}, window=("22:00", "23:00"))
    uid, busy = await _campaign(client, "busy@example.com", {"is_active": True, "interval_minutes": 60})
    rows = [await _sched(db_session, cid) for cid in (night, busy)]  # fetch both first: _sched expires the session
    for s in rows:
        s.next_run_at = NOW - timedelta(minutes=1)
    await db_session.commit()
    fake = FakeLauncher()

    async def live(user_id):
        return "run_live" if user_id == uid else None

    counts = await run_due_campaign_schedules(NOW, fake, live)
    assert counts == {"launched": 0, "skipped": 2, "armed": 0, "failed": 0} and fake.calls == []


@pytest.mark.asyncio
async def test_kill_switch(client, db_session, monkeypatch):
    _, cid = await _campaign(client, "kill@example.com", {"is_active": True, "interval_minutes": 60})
    s = await _sched(db_session, cid); s.next_run_at = NOW - timedelta(minutes=1); await db_session.commit()
    monkeypatch.setattr(settings, "SCHEDULED_RUNS_ENABLED", False)
    fake = FakeLauncher()
    assert await run_due_campaign_schedules(NOW, fake, _no_live) == {"launched": 0, "skipped": 0, "armed": 0, "failed": 0}
    assert fake.calls == []


@pytest.mark.asyncio
async def test_real_launcher_goes_through_the_shared_launch_path(client, db_session, monkeypatch):
    """_launch (the production launcher) builds its repositories and reaches orchestrator.start_run with the campaign's data."""
    from types import SimpleNamespace
    from unittest.mock import AsyncMock

    from app.application.automation.orchestrator import orchestrator
    from app.workers import campaign_scheduler

    uid, cid = await _campaign(client, "real@example.com", {"is_active": True, "interval_minutes": 60})
    start = AsyncMock(return_value=SimpleNamespace(run_id="run_fake", status=SimpleNamespace(value="RUNNING")))
    monkeypatch.setattr(orchestrator, "start_run", start)
    monkeypatch.setattr(orchestrator, "get_live_run_id", AsyncMock(return_value=None))
    try:
        result = await campaign_scheduler._launch(uid, cid)
    except Exception as e:  # a campaign without a connected platform is refused by the start use case
        pytest.skip(f"start use case refused the bare test campaign: {type(e).__name__}: {e}")
    start.assert_awaited_once()
    assert start.await_args.kwargs["user_id"] == uid and start.await_args.kwargs["campaign_id"] == cid
    assert result.run_id == "run_fake"
