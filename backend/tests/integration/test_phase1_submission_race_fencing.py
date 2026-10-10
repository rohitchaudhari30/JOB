import asyncio
import os
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.domain.applications.entities import (
    Application,
    WorkflowStateEnum,
    ApplicationOutcomeStatus,
    ApplicationEvent,
)
from app.core.exceptions import ValidationException
from app.infrastructure.database.models.models import (
    ApplicationModel,
    JobModel,
    JobSourceModel,
    UserModel,
    CandidateProfileModel,
    ResumeModel,
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
    _safe_save_app,
)


async def _setup_race_test_fixture(db_session, suffix: str):
    user_id = f"user_race_{suffix}"
    job_id = f"job_race_{suffix}"
    app_id = f"app_race_{suffix}"
    resume_id = f"res_race_{suffix}"

    user = UserModel(
        id=user_id,
        email=f"candidate_{suffix}@test.com",
        hashed_password="fakehash",
        full_name="Fencing Test Candidate",
        is_active=True,
    )
    db_session.add(user)

    profile = CandidateProfileModel(
        id=f"prof_{suffix}",
        user_id=user_id,
        headline="Senior Systems Engineer",
        phone="+1234567890",
        location="Remote",
    )
    db_session.add(profile)

    source_res = await db_session.execute(select(JobSourceModel).where(JobSourceModel.id == "naukri"))
    if not source_res.scalar_one_or_none():
        src = JobSourceModel(
            id="naukri",
            source_type=f"naukri_{suffix}",
            base_url="https://naukri.com",
            is_active=True,
        )
        db_session.add(src)
        await db_session.flush()

    job = JobModel(
        id=job_id,
        source_id="naukri",
        external_job_id=f"ext_{suffix}",
        title="Distributed Systems Engineer",
        company="Global Cloud Corp",
        location="Remote",
        apply_url="https://example.com/jobs/race-test",
        raw_description="Distributed consensus and concurrency control",
        is_active=True,
    )
    db_session.add(job)

    resume = ResumeModel(
        id=resume_id,
        user_id=user_id,
        label="Primary Resume",
        target_role="Software Engineer",
        file_path="mock://resumes/resume.pdf",
        file_name="resume.pdf",
        mime_type="application/pdf",
        is_default=True,
    )
    db_session.add(resume)

    app_model = ApplicationModel(
        id=app_id,
        user_id=user_id,
        job_id=job_id,
        resume_id=resume_id,
        idempotency_key=f"idem_{suffix}",
        workflow_state=WorkflowStateEnum.APPROVED.value,
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED.value,
    )
    db_session.add(app_model)
    await db_session.flush()

    return user_id, job_id, app_id, resume_id


# =========================================================================
# TEST 1: Pre-Submit Click Race: Sweeper recovers worker while waiting for button
# =========================================================================
@pytest.mark.asyncio
async def test_pre_submit_click_recovery_race_aborts_without_click(db_session, monkeypatch):
    """
    Deterministic Race Test (Pre-Click):
    1. Worker starts and sets SUBMITTING state with an attempt ID.
    2. Worker pauses immediately before the browser Submit click (during wait_for).
    3. Stale-worker recovery triggers and reclaims application to RECONCILIATION_REQUIRED.
    4. Worker resumes.
    5. Verifies that the browser Submit click is NOT invoked.
    6. Verifies that old worker cannot overwrite the recovered state.
    7. Verifies that ambiguous outcome is not automatically retried.
    """
    user_id, job_id, app_id, resume_id = await _setup_race_test_fixture(db_session, "pre_click")

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

    mock_fill_result = MagicMock(screening_questions=[], is_complete=True, unresolved_fields=[])
    use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)
    use_case._form_engine.fill_form = AsyncMock(return_value=mock_fill_result)

    # Setup controlled synchronization: hook wait_for to trigger stale recovery
    click_called = False

    async def _mock_wait_for(*args, **kwargs):
        # Sweeper runs while worker was paused right before clicking submit
        await app_repo.recover_stale_submitting_applications(older_than_seconds=-1)

    async def _mock_click(*args, **kwargs):
        nonlocal click_called
        click_called = True

    mock_locator = MagicMock()
    mock_locator.wait_for = AsyncMock(side_effect=_mock_wait_for)
    mock_locator.click = AsyncMock(side_effect=_mock_click)
    mock_locator.count = AsyncMock(return_value=1)

    mock_page = MagicMock()
    mock_page.goto = AsyncMock()
    mock_page.locator.return_value.first = mock_locator
    mock_page.is_closed = MagicMock(return_value=False)
    mock_page.screenshot = AsyncMock(return_value=b"screenshot_bytes")

    mock_context = MagicMock()
    mock_context.pages = [mock_page]
    mock_context.close = AsyncMock()

    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    # Execute worker
    res = await use_case.execute(application_id=app_id)

    # 5. Verify whether the browser Submit action was invoked -> MUST NOT BE CALLED!
    assert click_called is False, "Defect: Browser Submit action was invoked after worker lost ownership!"
    mock_locator.click.assert_not_called()

    # 6. Check that the old worker cannot overwrite the recovered state
    refreshed_app = await app_repo.get_by_id(app_id)
    assert refreshed_app.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert refreshed_app.outcome_status == ApplicationOutcomeStatus.UNKNOWN
    assert res.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED

    # 7. Verify that an ambiguous outcome is not automatically retried
    assert refreshed_app.next_retry_at is None

    retry_use_case = RetryApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=use_case,
        job_repo=job_repo,
        resume_repo=res_repo,
    )
    with pytest.raises(ValidationException, match="requiring reconciliation"):
        await retry_use_case.execute(application_id=app_id)


# =========================================================================
# TEST 2: Post-Submit Click Race: Sweeper recovers worker after click but before save
# =========================================================================
@pytest.mark.asyncio
async def test_post_submit_click_recovery_race_prevents_state_overwrite(db_session, monkeypatch):
    """
    Deterministic Race Test (Post-Click):
    1. Worker executes submit click on portal.
    2. Before post-click confirmation can be persisted, sweeper recovers stale SUBMITTING record.
    3. Worker attempts to save APPLIED state with stale expected_state=SUBMITTING.
    4. Atomic conditional update detects conflict and rejects the write.
    5. Old worker is safely fenced out and cannot overwrite RECONCILIATION_REQUIRED in DB.
    6. Outcome remains UNKNOWN and no automatic retry is scheduled.
    """
    user_id, job_id, app_id, resume_id = await _setup_race_test_fixture(db_session, "post_click")

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

    mock_form = MagicMock(has_challenge=False)
    mock_submit_btn = MagicMock(selector="button[type='submit']")
    mock_form.submit_buttons = [mock_submit_btn]
    use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)
    use_case._form_engine.fill_form = AsyncMock(return_value=MagicMock(screening_questions=[], is_complete=True, unresolved_fields=[]))

    click_invoked = False

    async def _mock_click(*args, **kwargs):
        nonlocal click_invoked
        click_invoked = True

    mock_locator = MagicMock()
    mock_locator.wait_for = AsyncMock()
    mock_locator.click = AsyncMock(side_effect=_mock_click)
    mock_locator.count = AsyncMock(return_value=1)

    mock_page = MagicMock()
    mock_page.goto = AsyncMock()
    mock_page.locator.return_value.first = mock_locator
    mock_page.is_closed = MagicMock(return_value=False)
    mock_page.screenshot = AsyncMock(return_value=b"screenshot_bytes")

    mock_context = MagicMock(pages=[mock_page], close=AsyncMock())
    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    # Hook verification: sweeper recovers the application during verification (post-click, pre-save)
    async def _mock_verify(*args, **kwargs):
        # Sweeper runs concurrently right here!
        await app_repo.recover_stale_submitting_applications(older_than_seconds=-1)
        return (
            WorkflowStateEnum.APPLIED,
            ApplicationOutcomeStatus.SUBMITTED,
            "Portal indicated success",
        )

    use_case._verify_submission_outcome = AsyncMock(side_effect=_mock_verify)

    # Execute
    res = await use_case.execute(application_id=app_id)

    # Confirm submit click was invoked
    assert click_invoked is True

    # Confirm worker was fenced out and database state was NOT overwritten with APPLIED
    refreshed_app = await app_repo.get_by_id(app_id)
    assert refreshed_app.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert refreshed_app.outcome_status == ApplicationOutcomeStatus.UNKNOWN
    assert refreshed_app.next_retry_at is None
    assert res.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED


# =========================================================================
# TEST 3: Exception Handler Race: Crash after click cannot overwrite recovery
# =========================================================================
@pytest.mark.asyncio
async def test_exception_handler_cannot_overwrite_recovery(db_session, monkeypatch):
    """
    Deterministic Test (Exception Handler Fencing):
    1. Worker executes submit click.
    2. Target browser crashes with an unexpected Playwright exception.
    3. While error handler is running, recovery sweeper reclaims application to RECONCILIATION_REQUIRED.
    4. Exception handler executes fenced save.
    5. Fenced save detects recovery conflict and refuses to overwrite database state.
    """
    user_id, job_id, app_id, resume_id = await _setup_race_test_fixture(db_session, "exc_race")

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

    mock_form = MagicMock(has_challenge=False)
    mock_submit_btn = MagicMock(selector="button[type='submit']")
    mock_form.submit_buttons = [mock_submit_btn]
    use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)
    use_case._form_engine.fill_form = AsyncMock(return_value=MagicMock(screening_questions=[], is_complete=True, unresolved_fields=[]))

    async def _crash_on_click(*args, **kwargs):
        # Crash occurs, and sweeper reclaims application
        await app_repo.recover_stale_submitting_applications(older_than_seconds=-1)
        raise RuntimeError("Browser process terminated unexpectedly during click")

    mock_locator = MagicMock()
    mock_locator.wait_for = AsyncMock()
    mock_locator.click = AsyncMock(side_effect=_crash_on_click)

    mock_page = MagicMock()
    mock_page.goto = AsyncMock()
    mock_page.locator.return_value.first = mock_locator
    mock_page.is_closed = MagicMock(return_value=True)

    mock_context = MagicMock(pages=[mock_page], close=AsyncMock())
    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    res = await use_case.execute(application_id=app_id)

    # Database must remain RECONCILIATION_REQUIRED, NOT overwritten with FAILED by exception handler
    refreshed_app = await app_repo.get_by_id(app_id)
    assert refreshed_app.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert refreshed_app.outcome_status == ApplicationOutcomeStatus.UNKNOWN
    assert refreshed_app.next_retry_at is None
    assert res.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
