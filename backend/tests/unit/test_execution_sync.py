"""DUP-10: one function copies run state onto the stored execution."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.application.automation.execution_sync import apply_final_state, sync_control_state
from app.domain.automation.state_machine import AutomationState
from app.domain.campaigns.state_machine import ExecutionStateEnum


def _session(status, **kw):
    base = dict(status=status, error_message=None, discovered_jobs_count=5, qualified_jobs_count=3,
                applications_submitted_count=2, failed_applications_count=1)
    return SimpleNamespace(**{**base, **kw})


@pytest.mark.parametrize("state,expected", [
    (AutomationState.COMPLETED, "COMPLETED"), (AutomationState.FAILED, "FAILED"),
    (AutomationState.ABORTED, "ABORTED"), (AutomationState.STOPPED, "ABORTED"),
])
def test_final_state_maps_status_and_copies_counters(state, expected):
    ex = SimpleNamespace(status="RUNNING", error_message=None, completed_at=None,
                         discovered_count=0, qualified_count=0, submitted_count=0, failed_count=0)
    apply_final_state(ex, _session(state, error_message="boom"))
    assert ex.status == expected
    assert (ex.discovered_count, ex.qualified_count, ex.submitted_count, ex.failed_count) == (5, 3, 2, 1)
    assert ex.completed_at is not None
    assert ex.error_message == ("boom" if expected == "FAILED" else None)


@pytest.mark.asyncio
async def test_control_sync_sets_status_and_only_stamps_completion_when_finished():
    ex = SimpleNamespace(status="RUNNING", completed_at=None)
    repo = SimpleNamespace(get_by_id=AsyncMock(return_value=ex), save=AsyncMock())
    await sync_control_state(repo, "e1", ExecutionStateEnum.PAUSED_USER, "pause")
    assert ex.status == "PAUSED_USER" and ex.completed_at is None
    await sync_control_state(repo, "e1", ExecutionStateEnum.ABORTED, "stop")
    assert ex.status == "ABORTED" and ex.completed_at is not None
    assert repo.save.await_count == 2


@pytest.mark.asyncio
async def test_control_sync_never_raises_and_ignores_unlinked_runs():
    repo = SimpleNamespace(get_by_id=AsyncMock(side_effect=RuntimeError("db down")), save=AsyncMock())
    await sync_control_state(repo, "e1", ExecutionStateEnum.RUNNING, "resume")  # logged, not raised
    await sync_control_state(repo, None, ExecutionStateEnum.RUNNING, "resume")
    assert repo.get_by_id.await_count == 1
