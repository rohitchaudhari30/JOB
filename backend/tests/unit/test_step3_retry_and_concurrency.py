import pytest
from unittest.mock import AsyncMock, MagicMock
from app.application.applications.use_cases import RetryApplicationUseCase, ReconcileApplicationUseCase
from app.core.exceptions import ValidationException
from app.domain.applications.entities import Application, WorkflowStateEnum, ApplicationOutcomeStatus
from app.domain.campaigns.entities import Campaign, CampaignSafetyPolicy
from app.domain.jobs.entities import Job
from app.domain.profile.entities import Resume


@pytest.mark.asyncio
async def test_retry_application_revalidates_job_existence():
    """Item A: RetryApplicationUseCase skips application if job is deleted."""
    mock_app_repo = AsyncMock()
    app = Application(
        id="app-retry-1",
        user_id="user_1",
        job_id="job_deleted",
        idempotency_key="idemp-1",
        workflow_state=WorkflowStateEnum.FAILED,
        failure_reason="Navigation timeout 30000ms exceeded on Naukri",
        retry_count=1,
    )
    mock_app_repo.get_by_id.return_value = app
    mock_app_repo.save.side_effect = lambda a, **kw: a

    mock_exec_uc = AsyncMock()
    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = None  # Job no longer exists

    use_case = RetryApplicationUseCase(
        app_repo=mock_app_repo,
        execute_use_case=mock_exec_uc,
        job_repo=mock_job_repo,
    )

    result = await use_case.execute("app-retry-1")
    assert result.workflow_state == WorkflowStateEnum.SKIPPED
    assert "Job posting is no longer available" in result.failure_reason
    mock_exec_uc.execute.assert_not_called()


@pytest.mark.asyncio
async def test_retry_application_revalidates_resume_ownership():
    """DEF-01 / Item A: RetryApplicationUseCase fails if resume belongs to another user."""
    mock_app_repo = AsyncMock()
    app = Application(
        id="app-retry-2",
        user_id="user_victim",
        job_id="job_valid",
        resume_id="res_attacker",
        idempotency_key="idemp-2",
        workflow_state=WorkflowStateEnum.FAILED,
        failure_reason="Timeout",
        retry_count=0,
    )
    mock_app_repo.get_by_id.return_value = app
    mock_app_repo.save.side_effect = lambda a, **kw: a

    mock_exec_uc = AsyncMock()
    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = Job(
        id="job_valid",
        source_id="src-1",
        external_job_id="ext-1",
        title="Engineer",
        company="Tech",
        location="NY",
        apply_url="https://example.com",
        raw_description="desc",
    )

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = Resume(
        id="res_attacker",
        user_id="different_user",  # Cross-tenant mismatch!
        label="Attacker Resume",
        target_role="Eng",
        file_path="/res.pdf",
        file_name="res.pdf",
    )

    use_case = RetryApplicationUseCase(
        app_repo=mock_app_repo,
        execute_use_case=mock_exec_uc,
        job_repo=mock_job_repo,
        resume_repo=mock_resume_repo,
    )

    result = await use_case.execute("app-retry-2")
    assert result.workflow_state == WorkflowStateEnum.FAILED
    assert "Attached resume does not belong to user" in result.failure_reason
    mock_exec_uc.execute.assert_not_called()


@pytest.mark.asyncio
async def test_retry_application_pauses_on_campaign_quota_exceeded():
    """Item A: RetryApplicationUseCase transitions to PAUSED_LIMIT if campaign daily quota is hit."""
    mock_app_repo = AsyncMock()
    app = Application(
        id="app-retry-3",
        user_id="user_1",
        job_id="job_valid",
        idempotency_key="idemp-3",
        workflow_state=WorkflowStateEnum.FAILED,
        failure_reason="Navigation timeout 30000ms exceeded on Naukri",
        retry_count=1,
    )
    mock_app_repo.get_by_id.return_value = app
    mock_app_repo.save.side_effect = lambda a, **kw: a

    mock_exec_uc = AsyncMock()
    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = Job(
        id="job_valid",
        source_id="src-1",
        external_job_id="ext-1",
        title="Engineer",
        company="Tech",
        location="NY",
        apply_url="https://example.com",
        raw_description="desc",
    )

    mock_camp_repo = AsyncMock()
    camp = Campaign(
        id="camp-1",
        user_id="user_1",
        name="Campaign",
        safety_policy=CampaignSafetyPolicy(daily_application_limit=5),
    )
    mock_camp_repo.list_by_user.return_value = [camp]
    mock_camp_repo.count_today_applications.return_value = 5  # Quota full!
    mock_camp_repo.count_hourly_applications.return_value = 1

    use_case = RetryApplicationUseCase(
        app_repo=mock_app_repo,
        execute_use_case=mock_exec_uc,
        job_repo=mock_job_repo,
        campaign_repo=mock_camp_repo,
    )

    result = await use_case.execute("app-retry-3")
    assert result.workflow_state == WorkflowStateEnum.PAUSED_LIMIT
    assert "Safety limit guard" in result.failure_reason
    mock_exec_uc.execute.assert_not_called()


@pytest.mark.asyncio
async def test_reconciliation_concurrent_modification_guard():
    """DEF-05: ReconcileApplicationUseCase raises ValidationException on state conflict."""
    mock_app_repo = AsyncMock()
    app = Application(
        id="app-reconcile-race",
        user_id="user_1",
        job_id="job_1",
        idempotency_key="idemp-4",
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED,
    )
    mock_app_repo.get_by_id.return_value = app

    # Simulate save detecting that state already moved concurrently
    async def mock_save(a, expected_state=None):
        if expected_state and expected_state != WorkflowStateEnum.RECONCILIATION_REQUIRED:
            raise ValidationException("Application state conflict: Expected [RECONCILIATION_REQUIRED], but current state is [APPLIED].")
        # Simulating concurrent transition occurred before save
        raise ValidationException("Application state conflict: Expected [RECONCILIATION_REQUIRED], but current state is [APPLIED].")

    mock_app_repo.save.side_effect = mock_save

    use_case = ReconcileApplicationUseCase(
        app_repo=mock_app_repo,
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            application_id="app-reconcile-race",
            action="CONFIRM_SUBMITTED",
        )

    assert "Application state conflict" in str(exc_info.value)
