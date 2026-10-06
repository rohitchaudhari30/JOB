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


@pytest.mark.asyncio
async def test_orchestrator_pipeline_injects_authenticated_session(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock
    from app.domain.connections.entities import BrowserSession
    from app.domain.matching.entities import MatchRule

    orchestrator = AutomationOrchestrator()
    session = AutomationSession(run_id="run_test_session", user_id="user_test_1")

    # Mock browser session repo
    mock_session_repo = MagicMock()
    mock_browser_session = BrowserSession(
        id="sess_123",
        connection_id="conn_123",
        user_id="user_test_1",
        source_id="naukri",
        encrypted_storage_state="mock_encrypted_state_blob",
        status="ACTIVE",
    )
    mock_session_repo.get_by_user_and_platform = AsyncMock(return_value=mock_browser_session)

    # Mock DiscoverJobsUseCase
    captured_kwargs = {}
    async def mock_discover_execute(*args, **kwargs):
        captured_kwargs.update(kwargs)
        return {"discovered_total": 0, "new_jobs_count": 0, "skipped_duplicates": 0, "jobs": []}

    monkeypatch.setattr("app.application.automation.orchestrator.DiscoverJobsUseCase.execute", mock_discover_execute)

    # Run core pipeline
    await orchestrator._run_pipeline_core(
        session=session,
        source_type="naukri",
        roles=["Data Engineer"],
        locations=["Remote"],
        min_salary=None,
        match_rule=MatchRule(),
        auto_apply_matches=False,
        max_applications=5,
        job_repo=MagicMock(),
        source_repo=MagicMock(),
        profile_repo=MagicMock(),
        resume_repo=MagicMock(),
        match_repo=MagicMock(),
        app_repo=MagicMock(),
        user_repo=MagicMock(),
        session_repo=mock_session_repo,
        ai_gateway=MagicMock(),
    )

    # Verify that encrypted_storage_state was passed to DiscoverJobsUseCase
    assert captured_kwargs.get("encrypted_storage_state") == "mock_encrypted_state_blob"
    assert session.active_state == "FINISHED"
