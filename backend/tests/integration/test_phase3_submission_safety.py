import os
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient

from app.domain.applications.entities import (
    Application,
    WorkflowStateEnum,
    ApplicationOutcomeStatus,
    ApplicationEvent,
)
from app.domain.jobs.entities import Job
from app.domain.profile.entities import Resume
from app.core.exceptions import ValidationException, EntityNotFoundException
from app.infrastructure.database.models.models import (
    ApplicationModel,
    JobModel,
    JobSourceModel,
    UserModel,
    CandidateProfileModel,
    ResumeModel,
    ApplicationEventModel,
)
from sqlalchemy import select
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemyResumeRepository,
)
from app.application.applications.use_cases import (
    ExecuteApplicationUseCase,
    RetryApplicationUseCase,
    ReconcileApplicationUseCase,
    _safe_save_app,
)
from app.infrastructure.browser.dom_analyzer import ScannedForm


async def _setup_test_user_and_job(db_session, user_suffix: str):
    user_id = f"user_p3_{user_suffix}"
    job_id = f"job_p3_{user_suffix}"

    user = UserModel(
        id=user_id,
        email=f"candidate_{user_suffix}@test.com",
        hashed_password="fakehash",
        full_name="Phase3 Candidate",
        is_active=True,
    )
    db_session.add(user)

    profile = CandidateProfileModel(
        id=f"prof_p3_{user_suffix}",
        user_id=user_id,
        headline="Staff Software Engineer",
        phone="+1234567890",
        location="Remote",
    )
    db_session.add(profile)

    # Ensure JobSourceModel exists
    source_res = await db_session.execute(select(JobSourceModel).where(JobSourceModel.id == "naukri"))
    if not source_res.scalar_one_or_none():
        src = JobSourceModel(
            id="naukri",
            source_type=f"naukri_{user_suffix}",
            base_url="https://naukri.com",
            is_active=True,
        )
        db_session.add(src)
        await db_session.flush()

    job = JobModel(
        id=job_id,
        source_id="naukri",
        external_job_id=f"ext_{user_suffix}",
        title="Principal Platform Engineer",
        company="Enterprise Tech Corp",
        location="Remote",
        apply_url="https://example.com/jobs/123",
        raw_description="Job description for platform engineer",
        is_active=True,
    )
    db_session.add(job)
    await db_session.flush()
    return user_id, job_id


def _create_test_resume(db_session, user_id: str, resume_id: str, file_path: str):
    resume = ResumeModel(
        id=resume_id,
        user_id=user_id,
        label="Primary Resume",
        target_role="Software Engineer",
        file_path=str(file_path),
        file_name="resume.pdf",
        mime_type="application/pdf",
        is_default=True,
    )
    db_session.add(resume)
    return resume


# =========================================================================
# SCENARIO 1: Submission succeeds and confirmation is recorded
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_1_submission_succeeds_and_confirmation_recorded(db_session, monkeypatch, tmp_path):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen1")
    resume_file = tmp_path / "candidate_resume.pdf"
    resume_file.write_text("Dummy Resume Content")

    _create_test_resume(db_session, user_id, "res_scen1", resume_file)

    app_model = ApplicationModel(
        id="app_scen1",
        user_id=user_id,
        job_id=job_id,
        resume_id="res_scen1",
        idempotency_key="idem_scen1",
        workflow_state=WorkflowStateEnum.APPROVED.value,
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED.value,
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    job_repo = SqlAlchemyJobRepository(session=db_session)
    prof_repo = SqlAlchemyProfileRepository(session=db_session)
    res_repo = SqlAlchemyResumeRepository(session=db_session)

    use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=prof_repo,
        resume_repo=res_repo,
    )

    # Mock DOM analyzer
    mock_form = MagicMock()
    mock_form.has_challenge = False
    mock_submit_btn = MagicMock()
    mock_submit_btn.selector = "button[type='submit']"
    mock_form.submit_buttons = [mock_submit_btn]

    mock_fill_result = MagicMock()
    mock_fill_result.screening_questions = []
    mock_fill_result.is_complete = True
    mock_fill_result.unresolved_fields = []

    use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)
    use_case._form_engine.fill_form = AsyncMock(return_value=mock_fill_result)

    # Mock Browser context & page
    mock_page = MagicMock()
    mock_page.goto = AsyncMock()
    mock_locator = MagicMock()
    mock_locator.first.click = AsyncMock()
    mock_locator.count = AsyncMock(return_value=1)
    mock_page.locator.return_value = mock_locator
    mock_page.is_closed = MagicMock(return_value=False)
    mock_page.screenshot = AsyncMock(return_value=b"screenshot_bytes")

    mock_context = MagicMock()
    mock_context.pages = [mock_page]
    mock_context.close = AsyncMock()

    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    # Mock verification outcome to return APPLIED + SUBMITTED
    use_case._verify_submission_outcome = AsyncMock(
        return_value=(
            WorkflowStateEnum.APPLIED,
            ApplicationOutcomeStatus.SUBMITTED,
            "Portal confirmation received: Application submitted successfully.",
        )
    )

    # Execute
    res = await use_case.execute(application_id="app_scen1")

    # Assertions
    assert res.workflow_state == WorkflowStateEnum.APPLIED
    assert res.outcome_status == ApplicationOutcomeStatus.SUBMITTED
    assert res.applied_at is not None
    assert res.current_attempt_id is not None

    # Verify database persistence
    refreshed = await app_repo.get_by_id("app_scen1")
    assert refreshed.workflow_state == WorkflowStateEnum.APPLIED
    assert refreshed.outcome_status == ApplicationOutcomeStatus.SUBMITTED
    assert refreshed.applied_at is not None


# =========================================================================
# SCENARIO 2: Submission succeeds externally, worker crashes before saving
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_2_submission_succeeds_externally_worker_crashes(db_session):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen2")

    # Stale record stuck in SUBMITTING older than 300 seconds
    stale_dt = datetime.now(timezone.utc) - timedelta(seconds=400)
    app_model = ApplicationModel(
        id="app_scen2_crash",
        user_id=user_id,
        job_id=job_id,
        idempotency_key="idem_scen2",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        current_attempt_id="att_crash_worker_01",
        updated_at=stale_dt,
        created_at=stale_dt,
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    recovered_count = await app_repo.recover_stale_submitting_applications(older_than_seconds=300)
    assert recovered_count == 1

    recovered_app = await app_repo.get_by_id("app_scen2_crash")
    assert recovered_app.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert recovered_app.outcome_status == ApplicationOutcomeStatus.UNKNOWN
    assert recovered_app.next_retry_at is None
    assert "Worker crashed or abandoned process during submission" in recovered_app.failure_reason


# =========================================================================
# SCENARIO 3: The external outcome is unknown
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_3_external_outcome_unknown_never_auto_retries(db_session, monkeypatch, tmp_path):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen3")
    resume_file = tmp_path / "resume_scen3.pdf"
    resume_file.write_text("Resume Content")

    _create_test_resume(db_session, user_id, "res_scen3", resume_file)

    app_model = ApplicationModel(
        id="app_scen3_unknown",
        user_id=user_id,
        job_id=job_id,
        resume_id="res_scen3",
        idempotency_key="idem_scen3",
        workflow_state=WorkflowStateEnum.APPROVED.value,
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    job_repo = SqlAlchemyJobRepository(session=db_session)
    prof_repo = SqlAlchemyProfileRepository(session=db_session)
    res_repo = SqlAlchemyResumeRepository(session=db_session)

    use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=prof_repo,
        resume_repo=res_repo,
    )

    mock_form = MagicMock(has_challenge=False, submit_buttons=[MagicMock(selector="btn")])
    mock_fill = MagicMock(screening_questions=[], is_complete=True, unresolved_fields=[])
    use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)
    use_case._form_engine.fill_form = AsyncMock(return_value=mock_fill)

    mock_page = MagicMock()
    mock_page.goto = AsyncMock()
    mock_locator = MagicMock()
    mock_locator.first.click = AsyncMock()
    mock_locator.count = AsyncMock(return_value=1)
    mock_page.locator.return_value = mock_locator
    mock_page.is_closed = MagicMock(return_value=False)
    mock_page.screenshot = AsyncMock(return_value=b"bytes")

    mock_context = MagicMock(pages=[mock_page], close=AsyncMock())
    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    # Simulate unknown / inconclusive submission outcome
    use_case._verify_submission_outcome = AsyncMock(
        return_value=(
            WorkflowStateEnum.RECONCILIATION_REQUIRED,
            ApplicationOutcomeStatus.UNKNOWN,
            "Network timeout while awaiting portal receipt. Outcome ambiguous.",
        )
    )

    res = await use_case.execute(application_id="app_scen3_unknown")
    assert res.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert res.outcome_status == ApplicationOutcomeStatus.UNKNOWN
    assert res.next_retry_at is None

    # Verify that calling RetryApplicationUseCase on this application is rejected!
    retry_use_case = RetryApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=use_case,
        job_repo=job_repo,
        resume_repo=res_repo,
    )
    with pytest.raises(ValidationException, match="requiring reconciliation"):
        await retry_use_case.execute(application_id="app_scen3_unknown")


# =========================================================================
# SCENARIO 4: Stale worker and recovery process operate concurrently
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_4_stale_worker_and_recovery_operate_concurrently(db_session, monkeypatch, tmp_path):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen4")
    resume_file = tmp_path / "resume_scen4.pdf"
    resume_file.write_text("Resume Content")

    _create_test_resume(db_session, user_id, "res_scen4", resume_file)

    stale_time = datetime.now(timezone.utc) - timedelta(seconds=350)
    app_model = ApplicationModel(
        id="app_scen4_race",
        user_id=user_id,
        job_id=job_id,
        resume_id="res_scen4",
        idempotency_key="idem_scen4",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        current_attempt_id="att_slow_worker_01",
        updated_at=stale_time,
        created_at=stale_time,
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    job_repo = SqlAlchemyJobRepository(session=db_session)
    prof_repo = SqlAlchemyProfileRepository(session=db_session)
    res_repo = SqlAlchemyResumeRepository(session=db_session)

    # 4A. Sweeper runs concurrently and reclaims the application
    recovered = await app_repo.recover_stale_submitting_applications(older_than_seconds=300)
    assert recovered == 1

    current_db = await app_repo.get_by_id("app_scen4_race")
    assert current_db.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED

    # 4B. Stale worker attempts to execute pre-submission action check
    use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=prof_repo,
        resume_repo=res_repo,
    )
    # Stale worker thinks its attempt is att_slow_worker_01 and state was SUBMITTING
    fresh_check = await app_repo.get_by_id("app_scen4_race")
    # Worker detects that state is no longer SUBMITTING
    assert fresh_check.workflow_state != WorkflowStateEnum.SUBMITTING

    # 4C. Stale worker attempts atomic conditional update expecting SUBMITTING and att_slow_worker_01
    stale_app_entity = Application(
        id="app_scen4_race",
        user_id=user_id,
        job_id=job_id,
        workflow_state=WorkflowStateEnum.APPLIED,
        outcome_status=ApplicationOutcomeStatus.SUBMITTED,
        current_attempt_id="att_slow_worker_01",
    )
    with pytest.raises(ValidationException, match="Application state conflict"):
        await app_repo.save(
            stale_app_entity,
            expected_state=WorkflowStateEnum.SUBMITTING,
            expected_attempt_id="att_slow_worker_01",
        )

    # Prove RECONCILIATION_REQUIRED was not overwritten
    persisted = await app_repo.get_by_id("app_scen4_race")
    assert persisted.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED


# =========================================================================
# SCENARIO 5: A user confirms that an application was submitted
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_5_user_confirms_submitted(db_session):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen5")

    app_model = ApplicationModel(
        id="app_scen5_recon",
        user_id=user_id,
        job_id=job_id,
        idempotency_key="idem_scen5",
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        failure_reason="Ambiguous submit outcome",
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    use_case = ReconcileApplicationUseCase(app_repo=app_repo)

    result = await use_case.execute(
        application_id="app_scen5_recon",
        action="CONFIRM_SUBMITTED",
        notes="Received confirmation email from Greenhouse HR",
    )

    assert result.workflow_state == WorkflowStateEnum.APPLIED
    assert result.outcome_status == ApplicationOutcomeStatus.SUBMITTED
    assert result.applied_at is not None
    assert "Confirmed submitted by candidate" in result.failure_reason

    # Verify event logged
    refreshed = await app_repo.get_by_id("app_scen5_recon")
    assert refreshed.workflow_state == WorkflowStateEnum.APPLIED
    assert refreshed.outcome_status == ApplicationOutcomeStatus.SUBMITTED


# =========================================================================
# SCENARIO 6: User explicitly marks not submitted and requests a retry
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_6_user_marks_not_submitted_and_retries(db_session, tmp_path):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen6")
    resume_file = tmp_path / "resume_scen6.pdf"
    resume_file.write_text("Resume Content")

    _create_test_resume(db_session, user_id, "res_scen6", resume_file)

    app_model = ApplicationModel(
        id="app_scen6_recon",
        user_id=user_id,
        job_id=job_id,
        resume_id="res_scen6",
        idempotency_key="idem_scen6",
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        retry_count=0,
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    job_repo = SqlAlchemyJobRepository(session=db_session)
    res_repo = SqlAlchemyResumeRepository(session=db_session)

    # 6A: Test MARK_NOT_SUBMITTED (without instant retry execution)
    use_case_mark = ReconcileApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        resume_repo=res_repo,
    )
    marked = await use_case_mark.execute(
        application_id="app_scen6_recon",
        action="MARK_NOT_SUBMITTED",
        notes="Portal showed session expired before submit",
    )
    assert marked.workflow_state == WorkflowStateEnum.FAILED
    assert marked.outcome_status == ApplicationOutcomeStatus.NOT_SUBMITTED

    # 6B: Test MARK_NOT_SUBMITTED_AND_RETRY
    # Reset state to RECONCILIATION_REQUIRED for testing retry action
    app_model.workflow_state = WorkflowStateEnum.RECONCILIATION_REQUIRED.value
    await db_session.flush()

    async def _fake_execute(application_id):
        return await app_repo.get_by_id(application_id)

    mock_exec = AsyncMock()
    mock_exec.execute = AsyncMock(side_effect=_fake_execute)

    use_case_retry = ReconcileApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=mock_exec,
        job_repo=job_repo,
        resume_repo=res_repo,
    )
    retried = await use_case_retry.execute(
        application_id="app_scen6_recon",
        action="MARK_NOT_SUBMITTED_AND_RETRY",
        notes="Retrying with verified fresh session",
    )
    assert retried.workflow_state == WorkflowStateEnum.APPROVED
    assert retried.outcome_status == ApplicationOutcomeStatus.NOT_SUBMITTED
    assert retried.retry_count == 1
    assert mock_exec.execute.called


# =========================================================================
# SCENARIO 7: A retry occurs while another worker is processing
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_7_retry_while_another_worker_processing(db_session):
    user_id, job_id = await _setup_test_user_and_job(db_session, "scen7")

    # Worker 1 is actively in APPLYING or SUBMITTING
    app_model = ApplicationModel(
        id="app_scen7_busy",
        user_id=user_id,
        job_id=job_id,
        idempotency_key="idem_scen7",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        retry_count=0,
    )
    db_session.add(app_model)
    await db_session.flush()

    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    mock_exec = AsyncMock()
    retry_use_case = RetryApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=mock_exec,
    )

    # Calling retry on currently processing application must raise ValidationException!
    with pytest.raises(ValidationException, match="currently being processed by another worker"):
        await retry_use_case.execute(application_id="app_scen7_busy")

    assert not mock_exec.execute.called


# =========================================================================
# SCENARIO 8: Selected resume is valid, exists, and belongs to correct user
# =========================================================================
@pytest.mark.asyncio
async def test_scenario_8_resume_validation_ownership_and_tenant(db_session, tmp_path):
    user_id_1, job_id_1 = await _setup_test_user_and_job(db_session, "scen8_u1")
    user_id_2, job_id_2 = await _setup_test_user_and_job(db_session, "scen8_u2")
    _, job_id_3 = await _setup_test_user_and_job(db_session, "scen8_j3")
    _, job_id_4 = await _setup_test_user_and_job(db_session, "scen8_j4")

    # 8A: Resume does not exist in DB
    app_repo = SqlAlchemyApplicationRepository(session=db_session)
    job_repo = SqlAlchemyJobRepository(session=db_session)
    prof_repo = SqlAlchemyProfileRepository(session=db_session)
    res_repo = SqlAlchemyResumeRepository(session=db_session)

    use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=prof_repo,
        resume_repo=res_repo,
    )

    app_nonexistent_resume = ApplicationModel(
        id="app_scen8_no_res",
        user_id=user_id_1,
        job_id=job_id_1,
        resume_id="res_does_not_exist",
        idempotency_key="idem_scen8_no_res",
        workflow_state=WorkflowStateEnum.APPROVED.value,
    )
    db_session.add(app_nonexistent_resume)
    await db_session.flush()

    with pytest.raises(ValidationException, match="not found in database"):
        await use_case.execute(application_id="app_scen8_no_res")

    # 8B: Tenant / User mismatch (Resume belongs to user_2, application belongs to user_1)
    res_file_2 = tmp_path / "other_user_resume.pdf"
    res_file_2.write_text("Other user resume")
    _create_test_resume(db_session, user_id_2, "res_other_user", res_file_2)

    app_wrong_tenant = ApplicationModel(
        id="app_scen8_wrong_tenant",
        user_id=user_id_1,
        job_id=job_id_2,
        resume_id="res_other_user",
        idempotency_key="idem_scen8_wrong_tenant",
        workflow_state=WorkflowStateEnum.APPROVED.value,
    )
    db_session.add(app_wrong_tenant)
    await db_session.flush()

    with pytest.raises(ValidationException, match="does not belong to user"):
        await use_case.execute(application_id="app_scen8_wrong_tenant")

    # 8C: Resume missing on disk
    _create_test_resume(db_session, user_id_1, "res_missing_file", "C:/nonexistent/path/on/disk/resume.pdf")

    app_missing_disk = ApplicationModel(
        id="app_scen8_missing_disk",
        user_id=user_id_1,
        job_id=job_id_3,
        resume_id="res_missing_file",
        idempotency_key="idem_scen8_missing_disk",
        workflow_state=WorkflowStateEnum.APPROVED.value,
    )
    db_session.add(app_missing_disk)
    await db_session.flush()

    with pytest.raises(ValidationException, match="inaccessible or missing on disk"):
        await use_case.execute(application_id="app_scen8_missing_disk")

    # 8D: Valid resume existing on disk and belonging to user
    valid_file = tmp_path / "valid_resume.pdf"
    valid_file.write_text("Valid PDF bytes")
    _create_test_resume(db_session, user_id_1, "res_valid", valid_file)

    # Re-verify through ReconcileApplicationUseCase
    recon_use_case = ReconcileApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        resume_repo=res_repo,
    )

    app_valid_recon = ApplicationModel(
        id="app_scen8_valid",
        user_id=user_id_1,
        job_id=job_id_4,
        resume_id="res_valid",
        idempotency_key="idem_scen8_valid",
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED.value,
    )
    db_session.add(app_valid_recon)
    await db_session.flush()

    res_recon = await recon_use_case.execute(
        application_id="app_scen8_valid",
        action="MARK_NOT_SUBMITTED",
    )
    assert res_recon.workflow_state == WorkflowStateEnum.FAILED
    assert res_recon.outcome_status == ApplicationOutcomeStatus.NOT_SUBMITTED
