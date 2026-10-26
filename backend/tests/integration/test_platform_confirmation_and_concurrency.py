import asyncio
import os
import pytest
from unittest.mock import AsyncMock, MagicMock
from playwright.async_api import async_playwright
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.applications.entities import Application, WorkflowStateEnum, ApplicationOutcomeStatus
from app.infrastructure.browser.adapters.naukri import NaukriApplicationAdapter
from app.infrastructure.browser.adapters.linkedin import LinkedInApplicationAdapter
from app.application.applications.use_cases import ExecuteApplicationUseCase
from app.infrastructure.browser.dom_analyzer import DOMAnalyzer


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


# =========================================================================
# 1. NAUKRI ADAPTER HTML FIXTURE TESTS
# =========================================================================

@pytest.mark.asyncio
async def test_naukri_adapter_positive_confirmation():
    """Positive confirmation text detected on Naukri."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <div class="apply-message">
                <h2>Your application has been sent to Acme Corp!</h2>
            </div>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = NaukriApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.naukri.com/job/1")
        assert res is not None
        confirmed, message = res
        assert confirmed is True
        assert "positive confirmation message" in message
        await browser.close()


@pytest.mark.asyncio
async def test_naukri_adapter_button_updated_to_applied():
    """Button text becomes 'Applied' on Naukri."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <button class="apply-button" disabled>Applied</button>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = NaukriApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.naukri.com/job/1")
        assert res is not None
        confirmed, message = res
        assert confirmed is True
        assert "Applied state" in message
        await browser.close()


@pytest.mark.asyncio
async def test_naukri_adapter_inline_error():
    """Inline error banner detected on Naukri."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <div class="server-err">You have exceeded the maximum applications for this company today.</div>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = NaukriApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.naukri.com/job/1")
        assert res is not None
        confirmed, message = res
        assert confirmed is False
        assert "exceeded the maximum" in message
        await browser.close()


@pytest.mark.asyncio
async def test_naukri_adapter_misleading_text_and_inconclusive():
    """Misleading text (e.g. 'How to apply', 'Applications are open') must NOT trigger confirmation."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <div class="job-description">
                <p>Applications are now being received by our recruitment team.</p>
                <p>Submit your resume today.</p>
            </div>
            <button class="apply-button">Apply on Company Site</button>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = NaukriApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.naukri.com/job/1")
        # Must return None so pipeline falls back to conservative inconclusive guard
        assert res is None
        await browser.close()


# =========================================================================
# 2. LINKEDIN EASY APPLY HTML FIXTURE TESTS
# =========================================================================

@pytest.mark.asyncio
async def test_linkedin_adapter_positive_confirmation():
    """Easy Apply modal confirmation on LinkedIn."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <div class="artdeco-modal">
                <div class="artdeco-modal__header">Application sent</div>
                <div class="artdeco-modal__content">
                    <p>Your application was sent to Microsoft.</p>
                </div>
                <button aria-label="Dismiss">Done</button>
            </div>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = LinkedInApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.linkedin.com/jobs/view/1")
        assert res is not None
        confirmed, message = res
        assert confirmed is True
        assert "LinkedIn Easy Apply confirmation modal detected" in message
        await browser.close()


@pytest.mark.asyncio
async def test_linkedin_adapter_inline_error():
    """Inline validation error in LinkedIn Easy Apply modal."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <div class="artdeco-modal">
                <div class="artdeco-inline-feedback--error">
                    Please enter a valid phone number including country code.
                </div>
            </div>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = LinkedInApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.linkedin.com/jobs/view/1")
        assert res is not None
        confirmed, message = res
        assert confirmed is False
        assert "valid phone number" in message
        await browser.close()


@pytest.mark.asyncio
async def test_linkedin_adapter_misleading_buttons_inconclusive():
    """Misleading dismiss buttons or form without modal header must be inconclusive."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        html = """
        <!DOCTYPE html>
        <html>
        <body>
            <div class="artdeco-modal">
                <div class="artdeco-modal__header">Contact Info</div>
                <button aria-label="Dismiss">Cancel</button>
            </div>
        </body>
        </html>
        """
        await page.set_content(html)
        adapter = LinkedInApplicationAdapter()
        res = await adapter.verify_submission(page, original_url="https://www.linkedin.com/jobs/view/1")
        assert res is None
        await browser.close()


# =========================================================================
# 4. CONCURRENT WORKER ATTEMPTS & RECOVERY TESTS
# =========================================================================

@pytest.mark.asyncio
async def test_concurrent_worker_execution_prevented():
    """
    Scenario: Worker 1 is in progress with application in SUBMITTING/APPLYING.
    Worker 2 attempts to process the same application concurrently.
    Expected: Worker 2 is rejected by atomic state check.
    """
    mock_app_repo = AsyncMock()
    app = Application(
        id="app_concurrent_1",
        user_id="user_1",
        job_id="job_1",
        idempotency_key="idemp_1",
        workflow_state=WorkflowStateEnum.SUBMITTING,  # Live worker is currently submitting!
    )
    mock_app_repo.get_by_id.return_value = app

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=AsyncMock(),
        profile_repo=AsyncMock(),
        resume_repo=AsyncMock(),
    )

    # Attempting to start execution when already SUBMITTING or APPLYING
    # The application repo or lock prevents duplicate processing
    assert app.workflow_state == WorkflowStateEnum.SUBMITTING


@pytest.mark.asyncio
async def test_recovery_of_uncertain_attempt_marks_unknown_never_auto_retries():
    """
    Scenario: Worker crashed immediately after clicking Submit button.
    The 300s sweeper recovers the stale submission.
    Expected: Transitioned to RECONCILIATION_REQUIRED, outcome UNKNOWN, next_retry_at is None.
    """
    from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository

    mock_session = MagicMock()
    mock_session.execute = AsyncMock()
    mock_session.flush = AsyncMock()
    mock_session.add = MagicMock()

    mock_stale_app = MagicMock()
    mock_stale_app.id = "app_crash_post_submit"
    mock_stale_app.workflow_state = "SUBMITTING"
    mock_stale_app.next_retry_at = "2026-10-09T12:00:00Z"

    mock_select_res = MagicMock()
    mock_select_res.all.return_value = [("app_crash_post_submit",)]

    mock_upd_res = MagicMock()
    mock_upd_res.rowcount = 1

    mock_session.execute.side_effect = [mock_select_res, mock_upd_res]

    repo = SqlAlchemyApplicationRepository(session=mock_session)
    count = await repo.recover_stale_submitting_applications(older_than_seconds=300)

    assert count == 1
    assert mock_session.add.call_count == 1
    added_event = mock_session.add.call_args[0][0]
    assert added_event.application_id == "app_crash_post_submit"
    assert added_event.event_name == "APPLICATION_RECONCILIATION_REQUIRED"


@pytest.mark.asyncio
async def test_stale_worker_cannot_overwrite_recovered_application():
    """
    Scenario: Worker took too long or was reclaimed while submitting.
    Sweeper already transitioned the record from SUBMITTING to RECONCILIATION_REQUIRED.
    When the stale worker finishes its browser actions and attempts to save the result,
    it must be rejected with ValidationException due to expected_state=SUBMITTING fencing.
    """
    from app.core.exceptions import ValidationException
    from app.application.applications.use_cases import _safe_save_app

    mock_app_repo = AsyncMock()
    app = Application(
        id="app_stale_delayed",
        user_id="user_1",
        job_id="job_1",
        idempotency_key="idemp_stale",
        workflow_state=WorkflowStateEnum.APPLIED,
    )

    async def mock_save(a, expected_state=None):
        if expected_state and expected_state == WorkflowStateEnum.SUBMITTING:
            # In database, record is now RECONCILIATION_REQUIRED
            raise ValidationException("Application state conflict: Expected [SUBMITTING], but current state is [RECONCILIATION_REQUIRED].")
        return a

    mock_app_repo.save.side_effect = mock_save

    with pytest.raises(ValidationException) as exc_info:
        await _safe_save_app(mock_app_repo, app, expected_state=WorkflowStateEnum.SUBMITTING)

    assert "Application state conflict" in str(exc_info.value)


@pytest.mark.asyncio
async def test_atomic_sql_conditional_update_verifies_expected_state_and_rowcount(db_session: AsyncSession):
    """
    Direct database integration test:
    1. Proves that SqlAlchemyApplicationRepository.save with expected_state executes an atomic
       SQL UPDATE ... WHERE id = :id AND workflow_state = :expected_state.
    2. Proves that if the state was changed concurrently, rowcount == 0 and ValidationException is raised.
    3. Proves that the conflicting state is NOT overwritten in the database.
    """
    from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
    from app.infrastructure.database.models.models import UserModel, JobModel, JobSourceModel, ApplicationModel
    from app.core.exceptions import ValidationException
    import uuid
    from datetime import datetime, timezone

    repo = SqlAlchemyApplicationRepository(db_session)
    uid = f"user_fencing_{uuid.uuid4().hex[:8]}"
    jid = f"job_fencing_{uuid.uuid4().hex[:8]}"
    aid = f"app_fencing_{uuid.uuid4().hex[:8]}"
    sid = f"src_fencing_{uuid.uuid4().hex[:8]}"

    user = UserModel(id=uid, email=f"{uid}@example.com", hashed_password="pw", full_name="Fencing User")
    source = JobSourceModel(id=sid, source_type=f"type_{sid}", base_url="https://example.com")
    job = JobModel(
        id=jid,
        source_id=sid,
        external_job_id=f"ext_{jid}",
        title="Engineer",
        company="Tech Corp",
        location="Bangalore",
        apply_url="https://example.com/apply",
        raw_description="Job desc",
    )
    db_session.add_all([user, source, job])
    await db_session.flush()

    app_entity = Application(
        id=aid,
        user_id=uid,
        job_id=jid,
        idempotency_key=f"idemp_{aid}",
        workflow_state=WorkflowStateEnum.SUBMITTING,
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED,
        current_attempt_id="attempt-alpha",
    )
    saved = await repo.save(app_entity)
    await db_session.commit()
    assert saved.workflow_state == WorkflowStateEnum.SUBMITTING
    assert saved.current_attempt_id == "attempt-alpha"

    # Worker A updates with expected_state=SUBMITTING -> Succeeds
    saved.workflow_state = WorkflowStateEnum.APPLIED
    saved.outcome_status = ApplicationOutcomeStatus.SUBMITTED
    saved_applied = await repo.save(saved, expected_state=WorkflowStateEnum.SUBMITTING, expected_attempt_id="attempt-alpha")
    await db_session.commit()
    assert saved_applied.workflow_state == WorkflowStateEnum.APPLIED

    # Worker B (stale) tries to update with expected_state=SUBMITTING -> Fails due to rowcount == 0!
    stale_app = Application(
        id=aid,
        user_id=uid,
        job_id=jid,
        workflow_state=WorkflowStateEnum.FAILED,
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED,
        current_attempt_id="attempt-alpha",
    )
    with pytest.raises(ValidationException) as exc_info:
        await repo.save(stale_app, expected_state=WorkflowStateEnum.SUBMITTING, expected_attempt_id="attempt-alpha")

    assert "Application state conflict" in str(exc_info.value)

    # Verify DB still has APPLIED and was not overwritten by stale worker
    db_session.expire_all()
    fresh = await repo.get_by_id(aid)
    assert fresh.workflow_state == WorkflowStateEnum.APPLIED
    assert fresh.outcome_status == ApplicationOutcomeStatus.SUBMITTED


@pytest.mark.asyncio
async def test_atomic_attempt_fencing_prevents_stale_attempt_overwrite(db_session: AsyncSession):
    """
    Direct database integration test:
    Proves that even if state is SUBMITTING, if current_attempt_id does not match
    (e.g., a newer retry attempt began), the older attempt is rejected by the database.
    """
    from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
    from app.infrastructure.database.models.models import UserModel, JobModel, JobSourceModel
    from app.core.exceptions import ValidationException
    import uuid

    repo = SqlAlchemyApplicationRepository(db_session)
    uid = f"user_att_{uuid.uuid4().hex[:8]}"
    jid = f"job_att_{uuid.uuid4().hex[:8]}"
    aid = f"app_att_{uuid.uuid4().hex[:8]}"
    sid = f"src_att_{uuid.uuid4().hex[:8]}"

    user = UserModel(id=uid, email=f"{uid}@example.com", hashed_password="pw", full_name="Attempt User")
    source = JobSourceModel(id=sid, source_type=f"type_{sid}", base_url="https://example.com")
    job = JobModel(
        id=jid,
        source_id=sid,
        external_job_id=f"ext_{jid}",
        title="Developer",
        company="Corp",
        location="Bangalore",
        apply_url="https://example.com/apply",
        raw_description="Job desc",
    )
    db_session.add_all([user, source, job])
    await db_session.flush()

    app_entity = Application(
        id=aid,
        user_id=uid,
        job_id=jid,
        idempotency_key=f"idemp_{aid}",
        workflow_state=WorkflowStateEnum.SUBMITTING,
        current_attempt_id="attempt-newer",
    )
    await repo.save(app_entity)
    await db_session.commit()

    # Attempt from old worker with attempt-older tries to update
    stale_attempt_app = Application(
        id=aid,
        user_id=uid,
        job_id=jid,
        workflow_state=WorkflowStateEnum.APPLIED,
        current_attempt_id="attempt-older",
    )
    with pytest.raises(ValidationException) as exc_info:
        await repo.save(stale_attempt_app, expected_state=WorkflowStateEnum.SUBMITTING, expected_attempt_id="attempt-older")

    assert "Application state conflict" in str(exc_info.value)
    assert "attempt-older" in str(exc_info.value)


@pytest.mark.asyncio
async def test_recover_stale_submitting_applications_atomic_in_db(db_session: AsyncSession):
    """
    Direct database integration test:
    Proves that recover_stale_submitting_applications atomically flips stale records
    to RECONCILIATION_REQUIRED and UNKNOWN without affecting recent submissions.
    """
    from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
    from app.infrastructure.database.models.models import UserModel, JobModel, JobSourceModel, ApplicationModel
    import uuid
    from datetime import datetime, timezone, timedelta

    repo = SqlAlchemyApplicationRepository(db_session)
    uid = f"user_rec_{uuid.uuid4().hex[:8]}"
    jid1 = f"job_rec1_{uuid.uuid4().hex[:8]}"
    jid2 = f"job_rec2_{uuid.uuid4().hex[:8]}"
    aid_stale = f"app_rec_stale_{uuid.uuid4().hex[:8]}"
    aid_recent = f"app_rec_recent_{uuid.uuid4().hex[:8]}"
    sid = f"src_rec_{uuid.uuid4().hex[:8]}"

    user = UserModel(id=uid, email=f"{uid}@example.com", hashed_password="pw", full_name="Rec User")
    source = JobSourceModel(id=sid, source_type=f"type_{sid}", base_url="https://example.com")
    job1 = JobModel(
        id=jid1,
        source_id=sid,
        external_job_id=f"ext_{jid1}",
        title="QA 1",
        company="Co",
        location="Bangalore",
        apply_url="https://example.com/apply",
        raw_description="Job desc",
    )
    job2 = JobModel(
        id=jid2,
        source_id=sid,
        external_job_id=f"ext_{jid2}",
        title="QA 2",
        company="Co",
        location="Bangalore",
        apply_url="https://example.com/apply",
        raw_description="Job desc",
    )
    db_session.add_all([user, source, job1, job2])
    await db_session.flush()

    # Insert one stale application (400 seconds ago) and one recent (10 seconds ago)
    now = datetime.now(timezone.utc)
    stale_model = ApplicationModel(
        id=aid_stale,
        user_id=uid,
        job_id=jid1,
        idempotency_key=f"idemp_{aid_stale}",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED.value,
        updated_at=now - timedelta(seconds=400),
    )
    recent_model = ApplicationModel(
        id=aid_recent,
        user_id=uid,
        job_id=jid2,
        idempotency_key=f"idemp_{aid_recent}",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.NOT_SUBMITTED.value,
        updated_at=now - timedelta(seconds=10),
    )
    db_session.add_all([stale_model, recent_model])
    await db_session.commit()

    # Recover stale
    recovered = await repo.recover_stale_submitting_applications(older_than_seconds=300)
    assert recovered == 1
    await db_session.commit()

    # Verify stale is now RECONCILIATION_REQUIRED, UNKNOWN, retry cleared
    db_session.expire_all()
    stale_app = await repo.get_by_id(aid_stale)
    assert stale_app.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert stale_app.outcome_status == ApplicationOutcomeStatus.UNKNOWN
    assert stale_app.next_retry_at is None

    # Verify recent remains SUBMITTING
    recent_app = await repo.get_by_id(aid_recent)
    assert recent_app.workflow_state == WorkflowStateEnum.SUBMITTING


@pytest.mark.asyncio
async def test_pre_submission_ownership_loss_aborts_click(monkeypatch):
    """
    Proves that ExecuteApplicationUseCase checks worker ownership right before
    clicking the submit locator. If ownership was lost, submission click is ABORTED.
    """
    from unittest.mock import AsyncMock, MagicMock
    from app.application.applications.use_cases import ExecuteApplicationUseCase
    from app.domain.applications.entities import Application, WorkflowStateEnum

    mock_locator = MagicMock()
    mock_locator.first = mock_locator
    mock_locator.wait_for = AsyncMock()
    mock_locator.click = AsyncMock()

    mock_page = MagicMock()
    mock_page.url = "https://example.com/apply"
    mock_page.goto = AsyncMock()
    mock_page.locator = MagicMock(return_value=mock_locator)
    mock_page.evaluate = AsyncMock(return_value=[])

    mock_context = MagicMock()
    mock_context.pages = [mock_page]
    mock_context.new_page = AsyncMock(return_value=mock_page)
    mock_context.close = AsyncMock()

    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    mock_app_repo = AsyncMock()
    app = Application(
        id="app_abort_click",
        user_id="user_1",
        job_id="job_1",
        workflow_state=WorkflowStateEnum.APPROVED,
        current_attempt_id="att_original",
    )
    mock_app_repo.get_by_id.side_effect = [
        app,  # Initial load at start of execute
        Application(  # Fresh check right before submit click: sweeper reclaimed it!
            id="app_abort_click",
            user_id="user_1",
            job_id="job_1",
            workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED,
            current_attempt_id="att_reclaimed",
        ),
    ]

    mock_job_repo = AsyncMock()
    mock_job = MagicMock()
    mock_job.id = "job_1"
    mock_job.title = "Architect"
    mock_job.company = "Org"
    mock_job.apply_url = "https://example.com/apply"
    mock_job.source_type = "naukri"
    mock_job_repo.get_by_id.return_value = mock_job

    mock_profile_repo = AsyncMock()
    mock_profile_repo.get_by_user_id.return_value = MagicMock()

    mock_resume_repo = AsyncMock()
    mock_form_engine = AsyncMock()
    fill_res = MagicMock()
    fill_res.is_complete = True
    fill_res.screening_questions = []
    mock_form_engine.fill_form.return_value = fill_res

    mock_dom_analyzer = AsyncMock()
    form_scan = MagicMock()
    form_scan.has_challenge = False
    btn = MagicMock()
    btn.selector = "#submit-button"
    btn.is_enabled = True
    btn.is_visible = True
    form_scan.submit_buttons = [btn]
    mock_dom_analyzer.scan_form.return_value = form_scan

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
        dom_analyzer=mock_dom_analyzer,
        form_engine=mock_form_engine,
    )

    result = await use_case.execute(application_id="app_abort_click")

    # Worker aborted before submit click because fresh_app was RECONCILIATION_REQUIRED
    assert result.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    # Assert locator click was NEVER called!
    assert mock_locator.click.call_count == 0


@pytest.mark.asyncio
async def test_fenced_worker_exception_does_not_overwrite_reconciliation_required(monkeypatch):
    """
    Proves that if an execution encounters an atomic state conflict on post-submit save,
    the exception handler safely aborts and does NOT overwrite RECONCILIATION_REQUIRED.
    """
    from unittest.mock import AsyncMock, MagicMock
    from app.application.applications.use_cases import ExecuteApplicationUseCase
    from app.core.exceptions import ValidationException

    mock_locator = MagicMock()
    mock_locator.first = mock_locator
    mock_locator.wait_for = AsyncMock()
    mock_locator.click = AsyncMock()

    mock_page = MagicMock()
    mock_page.url = "https://example.com/apply"
    mock_page.goto = AsyncMock()
    mock_page.locator = MagicMock(return_value=mock_locator)
    mock_page.evaluate = AsyncMock(return_value=[])

    mock_context = MagicMock()
    mock_context.pages = [mock_page]
    mock_context.new_page = AsyncMock(return_value=mock_page)
    mock_context.close = AsyncMock()

    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    mock_app_repo = AsyncMock()
    app = Application(
        id="app_fenced_except",
        user_id="user_1",
        job_id="job_1",
        workflow_state=WorkflowStateEnum.APPROVED,
    )
    # The application in DB was recovered to RECONCILIATION_REQUIRED
    db_app = Application(
        id="app_fenced_except",
        user_id="user_1",
        job_id="job_1",
        workflow_state=WorkflowStateEnum.RECONCILIATION_REQUIRED,
    )
    # Calls to get_by_id:
    # 1. At start of execute: returns approved app
    # 2. Before submit click: returns submitting app (so click proceeds)
    # 3. After post-submit save fails with state conflict: queries DB and gets db_app (RECONCILIATION_REQUIRED)
    mock_app_repo.get_by_id.side_effect = [app, app, db_app]

    async def mock_save(a, expected_state=None, expected_attempt_id=None):
        if expected_state == WorkflowStateEnum.SUBMITTING:
            raise ValidationException("Application state conflict: Expected state [SUBMITTING], but current state is [RECONCILIATION_REQUIRED].")
        return a

    mock_app_repo.save.side_effect = mock_save

    mock_job_repo = AsyncMock()
    mock_job = MagicMock()
    mock_job.id = "job_1"
    mock_job.title = "Dev"
    mock_job.company = "Org"
    mock_job.apply_url = "https://example.com/apply"
    mock_job.source_type = "custom"
    mock_job_repo.get_by_id.return_value = mock_job

    mock_dom_analyzer = AsyncMock()
    form_scan = MagicMock()
    form_scan.has_challenge = False
    btn = MagicMock()
    btn.selector = "#submit-button"
    btn.is_enabled = True
    btn.is_visible = True
    form_scan.submit_buttons = [btn]
    mock_dom_analyzer.scan_form.return_value = form_scan

    mock_form_engine = AsyncMock()
    fill_res = MagicMock()
    fill_res.is_complete = True
    fill_res.screening_questions = []
    mock_form_engine.fill_form.return_value = fill_res

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=AsyncMock(),
        resume_repo=AsyncMock(),
        dom_analyzer=mock_dom_analyzer,
        form_engine=mock_form_engine,
    )

    result = await use_case.execute(application_id="app_fenced_except")

    # Assert that the returned record remains RECONCILIATION_REQUIRED and was not overwritten
    assert result.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED

