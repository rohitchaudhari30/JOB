import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.application.applications.use_cases import ExecuteApplicationUseCase
from app.core.exceptions import ValidationException
from app.domain.applications.entities import Application, WorkflowStateEnum, ApplicationOutcomeStatus
from app.domain.profile.entities import Resume
from app.domain.jobs.entities import Job
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository


@pytest.mark.asyncio
async def test_resume_preflight_missing_resume_rejected():
    """Verify ExecuteApplicationUseCase rejects execution if resume is missing from database."""
    mock_app = MagicMock(spec=Application)
    mock_app.id = "app_1"
    mock_app.user_id = "user_1"
    mock_app.job_id = "job_1"
    mock_app.resume_id = "res_missing"

    mock_app_repo = AsyncMock()
    mock_app_repo.get_by_id.return_value = mock_app

    mock_job = MagicMock(spec=Job)
    mock_job.id = "job_1"
    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = mock_job

    mock_profile_repo = AsyncMock()
    mock_profile_repo.get_by_user_id.return_value = MagicMock()

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = None  # Missing!

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(application_id="app_1")

    assert "not found in database" in str(exc_info.value)


@pytest.mark.asyncio
async def test_resume_preflight_cross_tenant_resume_rejected():
    """Verify ExecuteApplicationUseCase rejects execution if resume belongs to another user."""
    mock_app = MagicMock(spec=Application)
    mock_app.id = "app_1"
    mock_app.user_id = "user_victim"
    mock_app.job_id = "job_1"
    mock_app.resume_id = "res_attacker"

    mock_app_repo = AsyncMock()
    mock_app_repo.get_by_id.return_value = mock_app

    mock_job = MagicMock(spec=Job)
    mock_job.id = "job_1"
    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = mock_job

    mock_profile_repo = AsyncMock()
    mock_profile_repo.get_by_user_id.return_value = MagicMock()

    mock_resume = MagicMock(spec=Resume)
    mock_resume.id = "res_attacker"
    mock_resume.user_id = "user_attacker"  # Different user!
    mock_resume.file_path = "mock://path.pdf"

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = mock_resume

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(application_id="app_1")

    assert "does not belong to user" in str(exc_info.value)


@pytest.mark.asyncio
async def test_resume_preflight_inaccessible_file_rejected(tmp_path):
    """Verify ExecuteApplicationUseCase rejects execution if file is missing on disk."""
    non_existent_file = str(tmp_path / "deleted_resume.pdf")

    mock_app = MagicMock(spec=Application)
    mock_app.id = "app_1"
    mock_app.user_id = "user_1"
    mock_app.job_id = "job_1"
    mock_app.resume_id = "res_deleted_file"

    mock_app_repo = AsyncMock()
    mock_app_repo.get_by_id.return_value = mock_app

    mock_job = MagicMock(spec=Job)
    mock_job.id = "job_1"
    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id.return_value = mock_job

    mock_profile_repo = AsyncMock()
    mock_profile_repo.get_by_user_id.return_value = MagicMock()

    mock_resume = MagicMock(spec=Resume)
    mock_resume.id = "res_deleted_file"
    mock_resume.user_id = "user_1"
    mock_resume.file_path = non_existent_file

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id.return_value = mock_resume

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
    )

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(application_id="app_1")

    assert "missing on disk" in str(exc_info.value)


@pytest.mark.asyncio
async def test_recover_stale_submitting_applications_marks_reconciliation_required():
    """Verify SqlAlchemyApplicationRepository recovers stale SUBMITTING apps to RECONCILIATION_REQUIRED."""
    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    # Mock finding 2 stale models
    mock_stale_1 = MagicMock()
    mock_stale_1.id = "app_stale_1"
    mock_stale_1.workflow_state = "SUBMITTING"

    mock_stale_2 = MagicMock()
    mock_stale_2.id = "app_stale_2"
    mock_stale_2.workflow_state = "SUBMITTING"

    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_stale_1, mock_stale_2]
    mock_session.execute.return_value = mock_result

    repo = SqlAlchemyApplicationRepository(session=mock_session)
    count = await repo.recover_stale_submitting_applications(older_than_seconds=300)

    assert count == 2
    assert mock_stale_1.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED.value
    assert mock_stale_1.outcome_status == ApplicationOutcomeStatus.UNKNOWN.value
    assert mock_stale_1.next_retry_at is None
    assert mock_stale_2.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED.value
    assert mock_stale_2.outcome_status == ApplicationOutcomeStatus.UNKNOWN.value
    assert mock_stale_2.next_retry_at is None
    mock_session.flush.assert_called_once()
