import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.api.v1.automation import StartRunRequest, start_automation_run
from app.application.automation.orchestrator import AutomationOrchestrator, AutomationSession
from app.domain.profile.entities import Resume


@pytest.mark.asyncio
async def test_start_run_request_resume_id_validation_success():
    """Verify that StartRunRequest accepts resume_id and validates ownership against authenticated user."""
    req = StartRunRequest(
        roles=["Python Engineer"],
        campaign_id="camp_123",
        resume_id="res_owner_123",
    )
    assert req.resume_id == "res_owner_123"

    mock_user = MagicMock()
    mock_user.id = "user_456"

    mock_resume = MagicMock(spec=Resume)
    mock_resume.id = "res_owner_123"
    mock_resume.user_id = "user_456"

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = mock_resume

    mock_orchestrator = MagicMock()
    mock_orchestrator.get_active_user_run.return_value = None
    mock_session = MagicMock(spec=AutomationSession)
    mock_session.run_id = "run_session_789"
    mock_session.user_id = "user_456"
    mock_session.status = "RUNNING"
    mock_session.active_state = "RUNNING"
    mock_session.is_paused = False
    mock_session.discovered_jobs_count = 0
    mock_session.matched_jobs_count = 0
    mock_session.applications_submitted_count = 0
    mock_session.current_job_title = None
    mock_session.current_application_id = None
    mock_session.error_message = None
    from datetime import datetime, timezone
    mock_session.created_at = datetime.now(timezone.utc)
    mock_session.completed_at = None
    mock_orchestrator.start_run = AsyncMock(return_value=mock_session)

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.api.v1.automation.orchestrator", mock_orchestrator)
        res = await start_automation_run(
            req=req,
            current_user=mock_user,
            job_repo=AsyncMock(),
            source_repo=AsyncMock(),
            profile_repo=AsyncMock(),
            resume_repo=mock_resume_repo,
            match_repo=AsyncMock(),
            app_repo=AsyncMock(),
            user_repo=AsyncMock(),
            campaign_repo=AsyncMock(),
        )

    assert res.run_id == "run_session_789"
    mock_orchestrator.start_run.assert_called_once()
    kwargs = mock_orchestrator.start_run.call_args.kwargs
    assert kwargs.get("resume_id") == "res_owner_123"


@pytest.mark.asyncio
async def test_start_run_request_resume_cross_tenant_rejection():
    """Verify that specifying another user's resume is rejected with 403 Forbidden."""
    req = StartRunRequest(
        roles=["Python Engineer"],
        resume_id="res_other_user",
    )

    mock_user = MagicMock()
    mock_user.id = "user_victim"

    mock_resume = MagicMock(spec=Resume)
    mock_resume.id = "res_other_user"
    mock_resume.user_id = "user_attacker"

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = mock_resume

    mock_orchestrator = MagicMock()
    mock_orchestrator.get_active_user_run.return_value = None
    mock_orchestrator.start_run = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.api.v1.automation.orchestrator", mock_orchestrator)
        with pytest.raises(HTTPException) as exc_info:
            await start_automation_run(
                req=req,
                current_user=mock_user,
                job_repo=AsyncMock(),
                source_repo=AsyncMock(),
                profile_repo=AsyncMock(),
                resume_repo=mock_resume_repo,
                match_repo=AsyncMock(),
                app_repo=AsyncMock(),
                user_repo=AsyncMock(),
                campaign_repo=AsyncMock(),
            )

    assert exc_info.value.status_code == 403
    assert "Unauthorized access" in exc_info.value.detail
    mock_orchestrator.start_run.assert_not_called()


@pytest.mark.asyncio
async def test_start_run_request_resume_not_found():
    """Verify that specifying a non-existent resume is rejected with 404 Not Found."""
    req = StartRunRequest(
        roles=["Python Engineer"],
        resume_id="res_non_existent",
    )

    mock_user = MagicMock()
    mock_user.id = "user_victim"

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = None

    mock_orchestrator = MagicMock()
    mock_orchestrator.get_active_user_run.return_value = None
    mock_orchestrator.start_run = AsyncMock()

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr("app.api.v1.automation.orchestrator", mock_orchestrator)
        with pytest.raises(HTTPException) as exc_info:
            await start_automation_run(
                req=req,
                current_user=mock_user,
                job_repo=AsyncMock(),
                source_repo=AsyncMock(),
                profile_repo=AsyncMock(),
                resume_repo=mock_resume_repo,
                match_repo=AsyncMock(),
                app_repo=AsyncMock(),
                user_repo=AsyncMock(),
                campaign_repo=AsyncMock(),
            )

    assert exc_info.value.status_code == 404
    assert "Resume [res_non_existent] not found" in exc_info.value.detail
    mock_orchestrator.start_run.assert_not_called()


@pytest.mark.asyncio
async def test_automation_orchestrator_initializes_session_with_resume_id():
    """Verify that AutomationOrchestrator stores resume_id in created AutomationSession."""
    orchestrator = AutomationOrchestrator()

    mock_job_repo = AsyncMock()
    mock_job_repo.list_active.return_value = []

    session = await orchestrator.start_run(
        user_id="user_123",
        source_type="naukri",
        roles=["Backend Developer"],
        resume_id="res_selected_target",
        job_repo=mock_job_repo,
    )
    try:
        assert session.resume_id == "res_selected_target"
        assert session.user_id == "user_123"
    finally:
        await orchestrator.cancel_background_tasks()
