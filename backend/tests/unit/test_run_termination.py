"""AUT-10: every run ends with a terminal event, and ABORTED counts as terminal."""
from unittest.mock import MagicMock

import pytest

from app.application.automation.orchestrator import AutomationOrchestrator, AutomationSession
from app.domain.automation.state_machine import AutomationState, AutomationStateMachine
from app.domain.matching.entities import MatchRule


@pytest.mark.parametrize(
    "state, expected",
    [
        (AutomationState.STOPPED, True),
        (AutomationState.ABORTED, True),
        (AutomationState.FAILED, True),
        (AutomationState.COMPLETED, True),
        (AutomationState.RUNNING, False),
        (AutomationState.PAUSED, False),
    ],
)
def test_is_terminal(state, expected):
    assert AutomationStateMachine(state).is_terminal is expected


async def _run_with_early_exit(monkeypatch):
    orch = AutomationOrchestrator()
    session = AutomationSession(run_id="run_x", user_id="user_x")
    session.transition_to(AutomationState.RUNNING)
    events = []

    async def fake_core(self, session, **kwargs):
        session.abort("user clicked stop")  # the real code returns early like this

    async def fake_broadcast(self, session, event_name, message, payload=None):
        if event_name in ("RUN_COMPLETED", "RUN_FAILED"):
            session.terminal_event_sent = True
        events.append(event_name)

    monkeypatch.setattr(AutomationOrchestrator, "_run_pipeline_core", fake_core)
    monkeypatch.setattr(AutomationOrchestrator, "_broadcast_event", fake_broadcast)

    await orch._execute_run_pipeline(
        session=session, source_type="naukri", roles=["x"], locations=None, min_salary=None,
        match_rule=MatchRule(), auto_apply_matches=False, max_applications=1,
        job_repo=MagicMock(), source_repo=MagicMock(),
    )
    return session, events


@pytest.mark.asyncio
async def test_cancelled_run_still_sends_a_final_event(monkeypatch):
    session, events = await _run_with_early_exit(monkeypatch)
    assert events.count("RUN_COMPLETED") == 1
    assert session.status == AutomationState.ABORTED
    assert session.completed_at is not None
