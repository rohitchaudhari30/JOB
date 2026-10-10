import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from app.application.applications.use_cases import ReconcileApplicationUseCase
from app.domain.applications.entities import (
    Application,
    ApplicationOutcomeStatus,
    WorkflowStateEnum,
)
from app.domain.campaigns.entities import Campaign, CampaignSafetyPolicy
from app.core.exceptions import EntityNotFoundException, ValidationException


@pytest.fixture
def mock_app_repo():
    repo = AsyncMock()
    return repo


@pytest.fixture
def sample_uncertain_application():
    return Application(
        id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        job_id=str(uuid.uuid4()),
        resume_id=str(uuid.uuid4()),
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED,
        failure_reason="Playwright timeout clicking submit button. Outcome unconfirmed.",
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_reconcile_confirm_submitted(mock_app_repo, sample_uncertain_application):
    mock_app_repo.get_by_id.return_value = sample_uncertain_application
    mock_app_repo.save.side_effect = lambda a: a

    use_case = ReconcileApplicationUseCase(app_repo=mock_app_repo)

    result = await use_case.execute(
        application_id=sample_uncertain_application.id,
        action="CONFIRM_SUBMITTED",
        notes="Checked Naukri portal - application was received",
    )

    assert result.workflow_state == WorkflowStateEnum.APPLIED
    assert result.outcome_status == ApplicationOutcomeStatus.SUBMITTED
    assert result.applied_at is not None
    assert "Confirmed submitted" in result.failure_reason
    assert mock_app_repo.save.called
    assert mock_app_repo.add_event.called

    # Check event payload
    event = mock_app_repo.add_event.call_args[0][0]
    assert event.event_name == "RECONCILIATION_CONFIRMED_SUBMITTED"
    assert event.payload["action"] == "CONFIRM_SUBMITTED"


@pytest.mark.asyncio
async def test_reconcile_dismiss(mock_app_repo, sample_uncertain_application):
    mock_app_repo.get_by_id.return_value = sample_uncertain_application
    mock_app_repo.save.side_effect = lambda a: a

    use_case = ReconcileApplicationUseCase(app_repo=mock_app_repo)

    result = await use_case.execute(
        application_id=sample_uncertain_application.id,
        action="DISMISS",
        notes="Job expired or no longer relevant",
    )

    assert result.workflow_state == WorkflowStateEnum.SKIPPED
    assert result.failure_reason == "Job expired or no longer relevant"
    assert mock_app_repo.save.called
    assert mock_app_repo.add_event.called

    event = mock_app_repo.add_event.call_args[0][0]
    assert event.event_name == "RECONCILIATION_DISMISSED"


@pytest.mark.asyncio
async def test_reconcile_mark_not_submitted_and_retry(mock_app_repo, sample_uncertain_application):
    mock_app_repo.get_by_id.return_value = sample_uncertain_application
    mock_app_repo.save.side_effect = lambda a: a

    mock_execute_use_case = AsyncMock()
    mock_execute_use_case.execute.return_value = sample_uncertain_application

    mock_job_repo = AsyncMock()
    mock_job = MagicMock(id=sample_uncertain_application.job_id)
    mock_job_repo.get_by_id.return_value = mock_job

    mock_resume_repo = AsyncMock()
    mock_resume = MagicMock(id=sample_uncertain_application.resume_id)
    mock_resume_repo.get_by_id.return_value = mock_resume

    mock_campaign_repo = AsyncMock()
    mock_campaign = Campaign(
        id=str(uuid.uuid4()),
        user_id=sample_uncertain_application.user_id,
        name="Tech Campaign",
        safety_policy=CampaignSafetyPolicy(
            daily_application_limit=10,
            hourly_application_limit=5,
            operating_start_time="00:00",
            operating_end_time="23:59",
        ),
    )
    mock_campaign_repo.list_by_user.return_value = [mock_campaign]
    mock_campaign_repo.count_today_applications.return_value = 2
    mock_campaign_repo.count_hourly_applications.return_value = 1

    use_case = ReconcileApplicationUseCase(
        app_repo=mock_app_repo,
        execute_use_case=mock_execute_use_case,
        job_repo=mock_job_repo,
        resume_repo=mock_resume_repo,
        campaign_repo=mock_campaign_repo,
    )

    result = await use_case.execute(
        application_id=sample_uncertain_application.id,
        action="MARK_NOT_SUBMITTED_AND_RETRY",
        notes="Portal confirmed not submitted. Retrying form execution.",
    )

    assert sample_uncertain_application.workflow_state == WorkflowStateEnum.APPROVED
    assert sample_uncertain_application.outcome_status == ApplicationOutcomeStatus.NOT_SUBMITTED
    assert sample_uncertain_application.retry_count == 1
    assert mock_execute_use_case.execute.called
    assert mock_app_repo.add_event.called


@pytest.mark.asyncio
async def test_reconcile_retry_blocked_by_safety_policy(mock_app_repo, sample_uncertain_application):
    mock_app_repo.get_by_id.return_value = sample_uncertain_application

    mock_campaign_repo = AsyncMock()
    mock_campaign = Campaign(
        id=str(uuid.uuid4()),
        user_id=sample_uncertain_application.user_id,
        name="Strict Campaign",
        safety_policy=CampaignSafetyPolicy(daily_application_limit=5, hourly_application_limit=2),
    )
    mock_campaign_repo.list_by_user.return_value = [mock_campaign]
    mock_campaign_repo.count_today_applications.return_value = 5  # Daily limit exceeded

    use_case = ReconcileApplicationUseCase(
        app_repo=mock_app_repo,
        campaign_repo=mock_campaign_repo,
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            application_id=sample_uncertain_application.id,
            action="MARK_NOT_SUBMITTED_AND_RETRY",
        )

    assert "Safety limit guard prevented retry" in str(exc_info.value)


@pytest.mark.asyncio
async def test_reconcile_rejects_already_applied_state(mock_app_repo):
    app = Application(
        id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
        job_id=str(uuid.uuid4()),
        resume_id=str(uuid.uuid4()),
        workflow_state=WorkflowStateEnum.APPLIED,
        outcome_status=ApplicationOutcomeStatus.SUBMITTED,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    mock_app_repo.get_by_id.return_value = app

    use_case = ReconcileApplicationUseCase(app_repo=mock_app_repo)

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            application_id=app.id,
            action="CONFIRM_SUBMITTED",
        )

    assert "does not require reconciliation" in str(exc_info.value)


@pytest.mark.asyncio
async def test_reconcile_rejects_unknown_action(mock_app_repo, sample_uncertain_application):
    mock_app_repo.get_by_id.return_value = sample_uncertain_application

    use_case = ReconcileApplicationUseCase(app_repo=mock_app_repo)

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(
            application_id=sample_uncertain_application.id,
            action="INVALID_ACTION",
        )

    assert "Invalid reconciliation action" in str(exc_info.value)
