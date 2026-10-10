import os
from pathlib import Path
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.application.applications.validators import ApplicationValidator
from app.application.applications.application_orchestrator import ApplicationOrchestrator
from app.application.applications.commands import ApplicationSource, QueueApplicationCommand
from app.application.applications.use_cases import ApproveApplicationUseCase
from app.core.config import settings
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.campaigns.entities import Campaign
from app.domain.jobs.entities import Job
from app.domain.profile.entities import Resume


@pytest.mark.asyncio
async def test_validator_rejects_unauthorized_resume_cross_tenant():
    """DEF-01: ApplicationValidator must reject a resume that belongs to another user."""
    mock_app_repo = AsyncMock()
    mock_app_repo.get_by_user_and_job.return_value = None

    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = Job(
        id="job-123",
        source_id="src-1",
        external_job_id="ext-1",
        title="Software Engineer",
        company="Acme Corp",
        location="Remote",
        apply_url="https://example.com/apply",
        raw_description="Job desc",
    )

    mock_profile_repo = AsyncMock()
    mock_resume_repo = AsyncMock()
    
    # Resume belongs to user_B ("attacker-or-other-user")
    mock_resume_repo.get_by_id.return_value = Resume(
        id="res-victim-999",
        user_id="user_B",
        label="Victim Resume",
        target_role="Developer",
        file_path="/storage/resumes/victim.pdf",
        file_name="victim.pdf",
    )

    validator = ApplicationValidator(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
    )

    # User A ("user_A") attempts to validate using User B's resume
    res = await validator.validate(
        user_id="user_A",
        job_id="job-123",
        resume_id="res-victim-999",
    )

    assert not res.is_valid
    assert res.error_code == "UNAUTHORIZED_RESUME"
    assert "does not belong to user" in res.error_message


@pytest.mark.asyncio
async def test_orchestrator_rejects_unauthorized_campaign_cross_tenant():
    """DEF-01: ApplicationOrchestrator must reject campaign belonging to another user."""
    mock_app_repo = AsyncMock()
    mock_job_repo = AsyncMock()
    mock_profile_repo = AsyncMock()
    mock_resume_repo = AsyncMock()
    mock_campaign_repo = AsyncMock()

    # Campaign belongs to user_B
    mock_campaign_repo.get_by_id.return_value = Campaign(
        id="camp-victim-456",
        user_id="user_B",
        name="Target Campaign",
    )

    orchestrator = ApplicationOrchestrator(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
        campaign_repo=mock_campaign_repo,
    )

    cmd = QueueApplicationCommand(
        user_id="user_A",
        job_id="job-123",
        source=ApplicationSource.CAMPAIGN,
        campaign_id="camp-victim-456",
    )

    result = await orchestrator.queue_application(cmd)

    assert not result.is_queued
    assert result.status == "REJECTED"
    assert result.error_code == "UNAUTHORIZED_CAMPAIGN"
    assert "does not belong to user" in result.error_message


@pytest.mark.asyncio
async def test_approve_use_case_rejects_unauthorized_resume():
    """DEF-01: ApproveApplicationUseCase must fail if resume belongs to another user."""
    mock_app_repo = AsyncMock()
    existing_app = Application(
        id="app-1",
        user_id="user_A",
        job_id="job-1",
        resume_id="res-1",
        idempotency_key="idemp-1",
        workflow_state=WorkflowStateEnum.APPROVAL_REQUIRED,
    )
    mock_app_repo.get_by_id.return_value = existing_app
    mock_app_repo.list_by_user.return_value = [existing_app]
    mock_app_repo.save.side_effect = lambda app: app

    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = Job(
        id="job-1",
        source_id="src-1",
        external_job_id="ext-1",
        title="Engineer",
        company="Tech",
        location="NY",
        apply_url="https://example.com",
        raw_description="desc",
    )

    mock_resume_repo = AsyncMock()
    # Resume belongs to user_B
    mock_resume_repo.get_by_id.return_value = Resume(
        id="res-unauthorized",
        user_id="user_B",
        label="Foreign Resume",
        target_role="Eng",
        file_path="/storage/test.pdf",
        file_name="test.pdf",
    )

    mock_exec_uc = AsyncMock()

    use_case = ApproveApplicationUseCase(
        app_repo=mock_app_repo,
        execute_use_case=mock_exec_uc,
        job_repo=mock_job_repo,
        resume_repo=mock_resume_repo,
    )

    updated_app = await use_case.execute(
        application_id="app-1",
        resume_id="res-unauthorized",
    )

    assert updated_app.workflow_state == WorkflowStateEnum.FAILED
    assert "Attached resume does not belong to user" in updated_app.failure_reason


@pytest.mark.asyncio
async def test_screenshot_path_traversal_jail_rejection():
    """DEF-02: Screenshot endpoint must reject paths outside settings.STORAGE_DIR."""
    from app.api.v1.applications import get_application_screenshot
    from app.domain.auth.entities import User

    current_user = User(
        id="user_A",
        email="user_a@example.com",
        hashed_password="pw",
        full_name="User A",
    )

    mock_app_repo = AsyncMock()

    # 1. Path traversal attempt outside storage root
    traversal_app = Application(
        id="app-traversal",
        user_id="user_A",
        job_id="job-1",
        idempotency_key="idemp-1",
        screenshot_file_path="../../windows/system32/cmd.exe",
    )
    mock_app_repo.get_by_id.return_value = traversal_app

    with pytest.raises(HTTPException) as exc_info:
        await get_application_screenshot(
            application_id="app-traversal",
            current_user=current_user,
            app_repo=mock_app_repo,
        )
    assert exc_info.value.status_code == 403
    assert "outside storage root is forbidden" in exc_info.value.detail

    # 2. Path inside storage root but non-existent
    non_existent_app = Application(
        id="app-nonexistent",
        user_id="user_A",
        job_id="job-1",
        idempotency_key="idemp-2",
        screenshot_file_path="screenshots/does_not_exist_file.png",
    )
    mock_app_repo.get_by_id.return_value = non_existent_app

    with pytest.raises(HTTPException) as exc_info_404:
        await get_application_screenshot(
            application_id="app-nonexistent",
            current_user=current_user,
            app_repo=mock_app_repo,
        )
    assert exc_info_404.value.status_code == 404
    assert "not found on disk" in exc_info_404.value.detail
