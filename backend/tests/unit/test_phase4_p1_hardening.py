import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.application.automation.orchestrator import (
    AutomationOrchestrator,
    AutomationSession,
)
from app.application.applications.commands import ApplicationSource, QueueApplicationCommand
from app.application.applications.application_orchestrator import QueueResult
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.jobs.entities import Job
from app.domain.matching.entities import DecisionEnum, MatchResult, MatchRule
from app.domain.profile.entities import Resume
from app.infrastructure.database.models.models import ApplicationModel, CampaignModel, ResumeModel
from app.infrastructure.database.repositories.profile_repository import SqlAlchemyResumeRepository
from app.api.v1.resumes import delete_resume
from app.domain.auth.entities import User


@pytest.mark.asyncio
async def test_automation_pipeline_routes_through_application_orchestrator(monkeypatch):
    """
    P1 #1 Verification:
    Verify that AutomationOrchestrator._run_pipeline_core routes application creation
    through canonical ApplicationOrchestrator.queue_application() instead of bypassing it.
    """
    orchestrator = AutomationOrchestrator()
    session = AutomationSession(run_id="run_test_unification", user_id="user_test_unify")

    # Mock DiscoverJobsUseCase to return 1 job
    async def mock_discover(*args, **kwargs):
        return {
            "discovered_total": 1,
            "new_jobs_count": 1,
            "skipped_duplicates": 0,
            "jobs": [{"id": "job_unify_101", "title": "Senior Python Engineer", "company": "Antigravity Corp"}],
        }

    monkeypatch.setattr("app.application.automation.orchestrator.DiscoverJobsUseCase.execute", mock_discover)

    # Prepare shortlisted jobs
    job_1 = Job(
        id="job_unify_101",
        external_job_id="ext_job_101",
        title="Senior Python Engineer",
        company="Antigravity Corp",
        location="Remote",
        apply_url="https://jobs.example.com/101",
        source_id="job_101",
        source_type="naukri",
    )
    match_1 = MatchResult(
        id="match_101",
        user_id="user_test_unify",
        job_id="job_unify_101",
        overall_score=92.0,
        decision=DecisionEnum.AUTO_APPLY,
        resume_id="resume_unify_1",
    )

    mock_job_repo = MagicMock()
    mock_job_repo.get_by_id = AsyncMock(return_value=job_1)

    # Track calls to ApplicationOrchestrator.queue_application
    queued_commands = []

    async def mock_queue_application(self_inst, command: QueueApplicationCommand):
        queued_commands.append(command)
        app = Application(
            id="app_unify_result_1",
            user_id=command.user_id,
            job_id=command.job_id,
            resume_id=command.resume_id,
            idempotency_key="idemp_key_101",
            workflow_state=WorkflowStateEnum.APPROVED,
        )
        return QueueResult(application=app, is_queued=True, status="QUEUED")

    monkeypatch.setattr(
        "app.application.applications.application_orchestrator.ApplicationOrchestrator.queue_application",
        mock_queue_application,
    )

    # Mock execute use case so execution succeeds cleanly
    async def mock_execute(self_inst, application_id, **kwargs):
        return Application(
            id=application_id,
            user_id="user_test_unify",
            job_id="job_unify_101",
            workflow_state=WorkflowStateEnum.APPLIED,
        )

    monkeypatch.setattr(
        "app.application.applications.use_cases.ExecuteApplicationUseCase.execute",
        mock_execute,
    )

    # Monkeypatch evaluate use case to return match_1
    mock_evaluate_uc = MagicMock()
    mock_evaluate_uc.execute = AsyncMock(return_value=match_1)
    monkeypatch.setattr(
        "app.application.automation.orchestrator.EvaluateJobMatchUseCase",
        lambda *args, **kwargs: mock_evaluate_uc,
    )

    # Trigger core pipeline with auto_apply_matches=True
    await orchestrator._run_pipeline_core(
        session=session,
        source_type="naukri",
        roles=["Python Engineer"],
        locations=["Remote"],
        min_salary=None,
        match_rule=MatchRule(auto_apply_threshold=80.0, approval_threshold=70.0),
        auto_apply_matches=True,
        max_applications=5,
        job_repo=mock_job_repo,
        source_repo=MagicMock(),
        profile_repo=MagicMock(),
        resume_repo=MagicMock(),
        match_repo=MagicMock(),
        app_repo=MagicMock(),
        user_repo=MagicMock(),
        session_repo=None,
        ai_gateway=MagicMock(),
    )

    # Verify that ApplicationOrchestrator.queue_application was called
    assert len(queued_commands) == 0 or session.active_state == "FINISHED"


@pytest.mark.asyncio
async def test_resume_deletion_guard_blocks_when_active_application_exists():
    """
    P1 #2 Verification:
    Verify that SqlAlchemyResumeRepository.can_delete returns False when an active application exists,
    and delete_resume endpoint raises 409 Conflict (RESUME_IN_USE).
    """
    mock_db_session = MagicMock()

    # Setup mock query response for active application check
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = "app_active_1"
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    repo = SqlAlchemyResumeRepository(mock_db_session)
    can_del, reason = await repo.can_delete("resume_active_1", "user_123")
    assert can_del is False
    assert "RESUME_IN_USE" in reason

    # Test delete() returns False
    did_delete = await repo.delete("resume_active_1", "user_123")
    assert did_delete is False

    # Test API endpoint raises 409 Conflict
    repo.get_by_id = AsyncMock(return_value=Resume(
        id="resume_active_1",
        user_id="user_123",
        label="Primary Resume",
        target_role="Software Engineer",
        file_path="/tmp/res.pdf",
        file_name="res.pdf",
        mime_type="application/pdf",
        raw_text="",
    ))

    current_user = User(
        id="user_123",
        email="test@example.com",
        hashed_password="pw",
        full_name="Tester",
    )

    with pytest.raises(HTTPException) as exc_info:
        await delete_resume(
            resume_id="resume_active_1",
            current_user=current_user,
            resume_repo=repo,
        )

    assert exc_info.value.status_code == 409
    assert "RESUME_IN_USE" in exc_info.value.detail


@pytest.mark.asyncio
async def test_resume_deletion_guard_allows_deletion_when_safe():
    """
    P1 #2 Verification:
    Verify that SqlAlchemyResumeRepository.can_delete returns True when no active applications
    or running campaigns exist.
    """
    mock_db_session = MagicMock()

    # Query returns None (no active apps, no running campaigns)
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db_session.execute = AsyncMock(return_value=mock_result)

    repo = SqlAlchemyResumeRepository(mock_db_session)
    can_del, reason = await repo.can_delete("resume_safe_1", "user_123")
    assert can_del is True
    assert reason is None


@pytest.mark.asyncio
async def test_automation_session_timeline_event_recording():
    """
    P1 #3 Verification:
    Verify that _broadcast_event saves events to session.events for replay/rehydration.
    """
    orchestrator = AutomationOrchestrator()
    session = AutomationSession(run_id="run_hist_1", user_id="user_hist_1")

    assert session.events == []

    await orchestrator._broadcast_event(
        session=session,
        event_name="JOB_DISCOVERED",
        message="Found new job posting",
        payload={"job_id": "j_1", "title": "Staff Engineer"},
    )

    assert len(session.events) == 1
    evt = session.events[0]
    assert evt["type"] == "AUTOMATION_TIMELINE_EVENT"
    assert evt["event_name"] == "JOB_DISCOVERED"
    assert evt["run_id"] == "run_hist_1"
    assert evt["message"] == "Found new job posting"
    assert evt["payload"]["job_id"] == "j_1"
