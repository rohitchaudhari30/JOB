import pytest
from app.application.automation.orchestrator import (
    AutomationOrchestrator,
    AutomationRunStatus,
    AutomationSession,
)


def test_automation_session_state_controls():
    session = AutomationSession(run_id="run_abc123", user_id="user_456")
    assert session.status == AutomationRunStatus.IDLE
    assert session.is_paused is False
    assert session.pause_event.is_set() is True

    # 1. Test Pause
    session.pause()
    assert session.is_paused is True
    assert session.status == AutomationRunStatus.PAUSED
    assert session.pause_event.is_set() is False

    # 2. Test Resume
    session.resume(user_input="123456")
    assert session.is_paused is False
    assert session.status == AutomationRunStatus.RUNNING
    assert session.pause_event.is_set() is True
    assert session.user_input_queue.get_nowait() == "123456"

    # 3. Test Abort
    session.abort(reason="User stopped run")
    assert session.cancel_requested is True
    assert session.status == AutomationRunStatus.ABORTED
    assert session.error_message == "User stopped run"


def test_orchestrator_session_registry():
    orchestrator = AutomationOrchestrator()
    session = AutomationSession(run_id="run_xyz", user_id="user_789")
    orchestrator._sessions["run_xyz"] = session
    orchestrator._user_active_runs["user_789"] = "run_xyz"

    retrieved = orchestrator.get_session("run_xyz")
    assert retrieved is not None
    assert retrieved.run_id == "run_xyz"

    active = orchestrator.get_active_user_run("user_789")
    assert active is not None
    assert active.run_id == "run_xyz"
