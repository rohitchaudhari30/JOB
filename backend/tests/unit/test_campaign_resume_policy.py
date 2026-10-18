import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.application.campaigns.use_cases import CreateCampaignUseCase
from app.domain.campaigns.entities import Campaign
from app.api.v1.automation import StartRunRequest, start_automation_run
from app.domain.profile.entities import Resume
from app.application.automation.orchestrator import AutomationSession


@pytest.mark.asyncio
async def test_create_campaign_persists_target_resume_id():
    """Verify that CreateCampaignUseCase sets target_resume_id on the created Campaign entity."""
    mock_repo = AsyncMock()
    mock_repo.save = AsyncMock(side_effect=lambda c: c)

    use_case = CreateCampaignUseCase(campaign_repo=mock_repo)
    campaign = await use_case.execute(
        user_id="user_test",
        name="Backend Engineering Campaign",
        target_resume_id="res_backend_senior_2026",
    )

    assert campaign.target_resume_id == "res_backend_senior_2026"
    assert campaign.user_id == "user_test"
    mock_repo.save.assert_called_once()


@pytest.mark.asyncio
async def test_campaign_execution_inherits_target_resume_id_when_omitted_in_run_request():
    """When a run request references a campaign without specifying resume_id, it inherits campaign.target_resume_id."""
    req = StartRunRequest(
        roles=["Backend Engineer"],
        campaign_id="camp_target_123",
        resume_id=None,  # Not provided in request body
    )

    mock_user = MagicMock()
    mock_user.id = "user_camp_owner"

    mock_campaign = MagicMock(spec=Campaign)
    mock_campaign.id = "camp_target_123"
    mock_campaign.target_resume_id = "res_camp_default"

    mock_campaign_repo = AsyncMock()
    mock_campaign_repo.get_by_id.return_value = mock_campaign

    mock_resume = MagicMock(spec=Resume)
    mock_resume.id = "res_camp_default"
    mock_resume.user_id = "user_camp_owner"

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = mock_resume

    mock_orchestrator = MagicMock()
    mock_orchestrator.get_active_user_run.return_value = None
    mock_orchestrator.get_live_run_id = AsyncMock(return_value=None)
    mock_session = MagicMock(spec=AutomationSession)
    mock_session.run_id = "run_session_camp"
    mock_session.user_id = "user_camp_owner"
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
            campaign_repo=mock_campaign_repo,
        )

    assert res.run_id == "run_session_camp"
    mock_orchestrator.start_run.assert_called_once()
    assert mock_orchestrator.start_run.call_args.kwargs.get("resume_id") == "res_camp_default"


@pytest.mark.asyncio
async def test_campaign_execution_fails_if_target_resume_is_cross_tenant():
    """Verify pre-flight check blocks campaign execution if campaign points to another user's resume."""
    req = StartRunRequest(
        roles=["Backend Engineer"],
        campaign_id="camp_target_123",
    )

    mock_user = MagicMock()
    mock_user.id = "user_camp_owner"

    mock_campaign = MagicMock(spec=Campaign)
    mock_campaign.id = "camp_target_123"
    mock_campaign.target_resume_id = "res_stolen"

    mock_campaign_repo = AsyncMock()
    mock_campaign_repo.get_by_id.return_value = mock_campaign

    mock_resume = MagicMock(spec=Resume)
    mock_resume.id = "res_stolen"
    mock_resume.user_id = "user_victim"

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = mock_resume

    mock_orchestrator = MagicMock()
    mock_orchestrator.get_active_user_run.return_value = None
    mock_orchestrator.get_live_run_id = AsyncMock(return_value=None)
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
                campaign_repo=mock_campaign_repo,
            )

    assert exc_info.value.status_code == 403
    assert "Unauthorized access" in exc_info.value.detail
    mock_orchestrator.start_run.assert_not_called()
