"""Q-02: a firing schedule starts one safe run. The run starter is mocked: nothing real is ever applied."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.application.automation.orchestrator import orchestrator
from app.core.config import settings
from app.core.exceptions import ConflictException
from app.workers import scheduler_worker as sw


@pytest.fixture
def schedule():
    cfg = sw.ScheduleJobConfig(schedule_id="sched_t", user_id="u1", roles=["Python"], locations=["Pune"],
                               interval_minutes=60, max_applications_per_run=500)
    sw.scheduler_worker._configs[cfg.schedule_id] = cfg
    yield cfg
    sw.scheduler_worker._configs.clear()


@pytest.fixture
def starter(monkeypatch):
    start = AsyncMock(return_value=SimpleNamespace(run_id="run_x"))
    monkeypatch.setattr(orchestrator, "start_run", start)
    monkeypatch.setattr(orchestrator, "get_live_run_id", AsyncMock(return_value=None))
    return start


def test_unattended_submitting_is_off_by_default():
    assert sw.ScheduleJobConfig(schedule_id="a", user_id="u").auto_apply is False


@pytest.mark.asyncio
async def test_firing_starts_one_run_that_only_discovers_and_matches(schedule, starter):
    await sw.scheduled_run_callback("sched_t", "u1")
    starter.assert_awaited_once()
    kw = starter.await_args.kwargs
    assert kw["user_id"] == "u1" and kw["roles"] == ["Python"] and kw["locations"] == ["Pune"]
    assert kw["auto_apply_matches"] is False  # waits for approval
    assert kw["max_applications"] == settings.GLOBAL_ACCOUNT_SAFE_CEILING  # 500 requested, capped


@pytest.mark.asyncio
async def test_auto_apply_only_when_the_user_opted_in(schedule, starter):
    schedule.auto_apply = True
    await sw.scheduled_run_callback("sched_t", "u1")
    assert starter.await_args.kwargs["auto_apply_matches"] is True


@pytest.mark.asyncio
async def test_skipped_when_a_run_is_already_live(schedule, starter, monkeypatch):
    monkeypatch.setattr(orchestrator, "get_live_run_id", AsyncMock(return_value="run_live"))
    await sw.scheduled_run_callback("sched_t", "u1")
    starter.assert_not_awaited()


@pytest.mark.asyncio
async def test_kill_switch_stops_everything(schedule, starter, monkeypatch):
    monkeypatch.setattr(settings, "SCHEDULED_RUNS_ENABLED", False)
    await sw.scheduled_run_callback("sched_t", "u1")
    starter.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize("sid,uid,active", [("missing", "u1", True), ("sched_t", "someone-else", True), ("sched_t", "u1", False)])
async def test_unknown_foreign_or_inactive_schedule_starts_nothing(schedule, starter, sid, uid, active):
    schedule.is_active = active
    await sw.scheduled_run_callback(sid, uid)
    starter.assert_not_awaited()


@pytest.mark.asyncio
async def test_start_failures_never_escape_into_the_scheduler(schedule, starter):
    starter.side_effect = RuntimeError("db down")
    await sw.scheduled_run_callback("sched_t", "u1")  # must not raise
    starter.side_effect = ConflictException("race")
    await sw.scheduled_run_callback("sched_t", "u1")  # lost the race: quietly skipped
