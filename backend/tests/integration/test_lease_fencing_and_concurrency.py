import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.campaigns.entities import Campaign, CampaignExecution
from app.domain.campaigns.state_machine import ExecutionStateEnum
from app.infrastructure.database.models.models import CampaignExecutionModel, ApplicationModel
from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignExecutionRepository


@pytest.mark.asyncio
async def test_multi_worker_acquisition_mutual_exclusion(db_session: AsyncSession):
    """
    Test that when two workers try to acquire the same campaign,
    Worker A gets ownership (was_created=True) and Worker B receives the existing
    execution without modifying or stealing Worker A's ownership.
    """
    repo = SqlAlchemyCampaignExecutionRepository(db_session)
    campaign_id = "camp_mutex_test_001"
    user_id = "user_mutex_test_001"

    # Worker A acquires
    exec_a, created_a = await repo.acquire_or_get_active_execution(
        campaign_id=campaign_id,
        user_id=user_id,
        worker_id="worker-A",
        lease_seconds=300,
    )
    assert created_a is True
    assert exec_a.worker_id == "worker-A"
    assert exec_a.status == "RUNNING"
    assert exec_a.lease_version == 1

    # Worker B attempts to acquire the same campaign concurrently
    exec_b, created_b = await repo.acquire_or_get_active_execution(
        campaign_id=campaign_id,
        user_id=user_id,
        worker_id="worker-B",
        lease_seconds=300,
    )
    assert created_b is False
    assert exec_b.id == exec_a.id
    assert exec_b.worker_id == "worker-A"  # Still owned by Worker A!
    assert exec_b.lease_version == 1


@pytest.mark.asyncio
async def test_sweeper_transitions_to_recovery_pending_with_fencing_token(db_session: AsyncSession):
    """
    Test that when an active execution lease expires:
    1. Sweeper transitions status to RECOVERY_PENDING (not terminal FAILED).
    2. Sweeper increments lease_version monotonic fencing token.
    3. Old worker with stale lease_version is fenced out from heartbeat.
    """
    repo = SqlAlchemyCampaignExecutionRepository(db_session)
    campaign_id = "camp_sweeper_test_002"
    user_id = "user_sweeper_test_002"

    # Worker A acquires execution
    exec_a, _ = await repo.acquire_or_get_active_execution(
        campaign_id=campaign_id,
        user_id=user_id,
        worker_id="worker-A",
        lease_seconds=300,
    )
    assert exec_a.lease_version == 1

    # Simulate worker crash by expiring lease in database
    db_session.expire_all()
    stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == exec_a.id)
    model = await db_session.scalar(stmt)
    assert model is not None
    model.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    await db_session.commit()

    # Sweeper reclaims expired lease
    reclaimed_count = await repo.reclaim_expired_leases()
    assert reclaimed_count == 1

    # Verify execution is now in RECOVERY_PENDING with incremented fencing token
    db_session.expire_all()
    recovered_exec = await repo.get_by_id(exec_a.id)
    assert recovered_exec is not None
    assert recovered_exec.status == "RECOVERY_PENDING"
    assert recovered_exec.lease_version == 2

    # Zombie Worker A attempts heartbeat with stale lease_version=1 -> Rejected!
    stale_hb = await repo.record_heartbeat(
        execution_id=exec_a.id,
        worker_id="worker-A",
        lease_version=1,
    )
    assert stale_hb is None

    # Zombie Worker A attempts to save stale status -> Rejected by save fencing guard!
    stale_save_input = CampaignExecution(
        id=exec_a.id,
        campaign_id=campaign_id,
        user_id=user_id,
        status="COMPLETED",
        worker_id="worker-A",
        lease_version=1,  # Stale!
    )
    saved_result = await repo.save(stale_save_input)
    assert saved_result.status == "RECOVERY_PENDING"  # Preserved authoritative state
    assert saved_result.lease_version == 2


@pytest.mark.asyncio
async def test_new_worker_resumes_recovery_pending_execution(db_session: AsyncSession):
    """
    Test that when an execution is in RECOVERY_PENDING, a healthy new worker
    (Worker B) recovers it, increments the lease_version, resets status to RUNNING,
    and takes over active execution.
    """
    repo = SqlAlchemyCampaignExecutionRepository(db_session)
    campaign_id = "camp_takeover_test_003"
    user_id = "user_takeover_test_003"

    # Start with worker A
    exec_a, _ = await repo.acquire_or_get_active_execution(
        campaign_id=campaign_id,
        user_id=user_id,
        worker_id="worker-A",
        lease_seconds=300,
    )

    # Expire and sweep into RECOVERY_PENDING
    db_session.expire_all()
    stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == exec_a.id)
    model = await db_session.scalar(stmt)
    model.lease_expires_at = datetime.now(timezone.utc) - timedelta(seconds=10)
    await db_session.commit()
    await repo.reclaim_expired_leases()

    # Worker B acquires the campaign
    exec_b, was_acquired = await repo.acquire_or_get_active_execution(
        campaign_id=campaign_id,
        user_id=user_id,
        worker_id="worker-B",
        lease_seconds=300,
    )

    assert was_acquired is True
    assert exec_b.id == exec_a.id
    assert exec_b.worker_id == "worker-B"
    assert exec_b.status == "RUNNING"
    assert exec_b.lease_version == 3  # Initial(1) -> Sweeper(2) -> Worker B takeover(3)

    # Worker B's heartbeat with correct lease_version succeeds
    active_hb = await repo.record_heartbeat(
        execution_id=exec_b.id,
        worker_id="worker-B",
        lease_version=3,
    )
    assert active_hb is not None
    assert active_hb.worker_id == "worker-B"


@pytest.mark.asyncio
async def test_submission_uncertainty_prevents_duplicate_apply(monkeypatch):
    """
    Test that if an error occurs while an application is in the SUBMITTING state,
    it transitions to RECONCILIATION_REQUIRED and is NOT marked as retryable.
    """
    from unittest.mock import AsyncMock, MagicMock
    from app.application.applications.use_cases import ExecuteApplicationUseCase
    from app.domain.jobs.entities import Job

    mock_app = Application(
        id="app_uncertain_001",
        user_id="user_test_001",
        job_id="job_test_001",
        workflow_state=WorkflowStateEnum.SUBMITTING,
    )
    mock_job = Job(
        id="job_test_001",
        source_id="naukri",
        external_job_id="ext_123",
        title="Senior Python Architect",
        company="TechCorp",
        location="Remote",
        apply_url="https://example.com/apply",
    )
    mock_profile = MagicMock(user_id="user_test_001")

    mock_app_repo = AsyncMock()
    mock_app_repo.get_by_id = AsyncMock(return_value=mock_app)
    mock_app_repo.save = AsyncMock(side_effect=lambda a: a)

    mock_job_repo = AsyncMock()
    mock_job_repo.get_by_id = AsyncMock(return_value=mock_job)

    mock_profile_repo = AsyncMock()
    mock_profile_repo.get_by_user_id = AsyncMock(return_value=mock_profile)

    mock_resume_repo = AsyncMock()
    mock_resume_repo.get_by_id = AsyncMock(return_value=None)

    use_case = ExecuteApplicationUseCase(
        app_repo=mock_app_repo,
        job_repo=mock_job_repo,
        profile_repo=mock_profile_repo,
        resume_repo=mock_resume_repo,
    )

    # Mock browser and DOM elements
    mock_form = MagicMock()
    mock_form.has_challenge = False
    mock_submit_btn = MagicMock()
    mock_submit_btn.selector = "button.submit-application"
    mock_form.submit_buttons = [mock_submit_btn]

    mock_fill_result = MagicMock()
    mock_fill_result.screening_questions = []
    mock_fill_result.is_complete = True
    mock_fill_result.unresolved_fields = []

    use_case._dom_analyzer.scan_form = AsyncMock(return_value=mock_form)
    use_case._form_engine.fill_form = AsyncMock(return_value=mock_fill_result)

    # Mock page locator click to fail when clicking submit button
    mock_page = MagicMock()
    mock_page.goto = AsyncMock()
    mock_locator = MagicMock()
    mock_locator.first.click = AsyncMock(side_effect=ConnectionResetError("Browser connection lost during submit"))
    mock_page.locator = MagicMock(return_value=mock_locator)

    mock_context = MagicMock()
    mock_context.pages = [mock_page]
    mock_context.close = AsyncMock()

    from app.infrastructure.browser.browser_manager import browser_manager
    monkeypatch.setattr(browser_manager, "create_isolated_context", AsyncMock(return_value=mock_context))

    # Execute
    res = await use_case.execute(application_id="app_uncertain_001")

    # Verify state is RECONCILIATION_REQUIRED to prevent double application
    assert res.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert res.next_retry_at is None  # Not automatically retried
    assert "RECONCILIATION_REQUIRED" in res.failure_reason


@pytest.mark.asyncio
async def test_challenge_timeout_unpauses_and_resumes():
    """
    Test that an OTP/CAPTCHA challenge timeout does not block the worker indefinitely.
    When timeout fires, session is unpaused and marked with failure.
    """
    from app.application.automation.orchestrator import AutomationSession, AutomationState

    session = AutomationSession(
        run_id="run_challenge_timeout_001",
        user_id="user_test_timeout",
    )
    session.transition_to(AutomationState.STARTING)
    session.transition_to(AutomationState.RUNNING)

    # Pause for challenge
    session.pause()
    assert session.is_paused is True
    assert not session.pause_event.is_set()

    # Simulate timeout handler
    async def simulate_timeout_guard(timeout_sec: float = 0.05):
        try:
            await asyncio.wait_for(session.pause_event.wait(), timeout=timeout_sec)
        except asyncio.TimeoutError:
            session.failed_applications_count += 1
            session.is_paused = False
            session.pause_event.set()

    await simulate_timeout_guard(timeout_sec=0.05)

    assert session.is_paused is False
    assert session.pause_event.is_set()
    assert session.failed_applications_count == 1


@pytest.mark.asyncio
async def test_multi_worker_atomic_quota_reservation_exhaustion(db_session: AsyncSession):
    """
    Test that database-level atomic quota reservation prevents TOCTOU over-submission.
    When daily limit is 1, Worker A's reservation blocks Worker B, even before
    the application is submitted.
    """
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyQuotaReservationRepository

    quota_repo = SqlAlchemyQuotaReservationRepository(db_session)
    campaign_id = "camp_quota_test_001"
    user_id = "user_quota_test_001"

    # Worker A reserves the single available slot
    res_a = await quota_repo.reserve_slot(
        campaign_id=campaign_id,
        user_id=user_id,
        job_id="job_001",
        daily_limit=1,
        ttl_seconds=300,
    )
    assert res_a is not None
    assert res_a.status.value == "RESERVED"
    assert res_a.job_id == "job_001"

    # Worker B concurrently attempts to reserve a slot under the same campaign
    res_b = await quota_repo.reserve_slot(
        campaign_id=campaign_id,
        user_id=user_id,
        job_id="job_002",
        daily_limit=1,
        ttl_seconds=300,
    )
    # Blocked immediately by atomic reservation check!
    assert res_b is None

    # Worker A completes submission and consumes slot
    consumed = await quota_repo.consume_slot(res_a.id)
    assert consumed is True

    # Worker B retries — still blocked because consumed count reached daily limit
    res_b_retry = await quota_repo.reserve_slot(
        campaign_id=campaign_id,
        user_id=user_id,
        job_id="job_002",
        daily_limit=1,
        ttl_seconds=300,
    )
    assert res_b_retry is None


@pytest.mark.asyncio
async def test_quota_reservation_release_allows_subsequent_worker(db_session: AsyncSession):
    """
    Test that if an application fails or is skipped, releasing the reserved slot
    frees the quota for subsequent attempts.
    """
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyQuotaReservationRepository

    quota_repo = SqlAlchemyQuotaReservationRepository(db_session)
    campaign_id = "camp_quota_release_002"
    user_id = "user_quota_release_002"

    # Worker A reserves slot
    res_a = await quota_repo.reserve_slot(
        campaign_id=campaign_id,
        user_id=user_id,
        job_id="job_rel_001",
        daily_limit=1,
        ttl_seconds=300,
    )
    assert res_a is not None

    # Worker B is blocked
    res_b = await quota_repo.reserve_slot(
        campaign_id=campaign_id,
        user_id=user_id,
        job_id="job_rel_002",
        daily_limit=1,
        ttl_seconds=300,
    )
    assert res_b is None

    # Worker A encounters challenge timeout or failure, releases slot
    released = await quota_repo.release_slot(res_a.id)
    assert released is True

    # Worker B now successfully reserves the freed slot
    res_b_after = await quota_repo.reserve_slot(
        campaign_id=campaign_id,
        user_id=user_id,
        job_id="job_rel_002",
        daily_limit=1,
        ttl_seconds=300,
    )
    assert res_b_after is not None
    assert res_b_after.job_id == "job_rel_002"


@pytest.mark.asyncio
async def test_database_level_unique_constraint_double_application(db_session: AsyncSession):
    """
    Verify that the database schema enforces hard unique constraint on (user_id, job_id)
    as the ultimate source of truth, raising IntegrityError on concurrent duplicate insert.
    """
    from sqlalchemy.exc import IntegrityError
    from app.infrastructure.database.models.models import ApplicationModel
    import uuid

    app1 = ApplicationModel(
        id=f"app_{uuid.uuid4().hex[:12]}",
        user_id="user_uq_001",
        job_id="job_uq_001",
        idempotency_key="key_001",
        workflow_state="APPLIED",
        outcome_status="SUBMITTED",
    )
    db_session.add(app1)
    await db_session.commit()

    # Attempt to insert identical (user_id, job_id)
    app2 = ApplicationModel(
        id=f"app_{uuid.uuid4().hex[:12]}",
        user_id="user_uq_001",
        job_id="job_uq_001",
        idempotency_key="key_002",
        workflow_state="SUBMITTING",
        outcome_status="NOT_SUBMITTED",
    )
    db_session.add(app2)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()


@pytest.mark.asyncio
async def test_database_level_unique_constraint_quota_reservation(db_session: AsyncSession):
    """
    Verify that QuotaReservationModel enforces unique constraint on (campaign_id, job_id)
    preventing duplicate reservation records for the same job in a campaign.
    """
    from sqlalchemy.exc import IntegrityError
    from app.infrastructure.database.models.models import QuotaReservationModel
    import uuid

    r1 = QuotaReservationModel(
        id=f"res_{uuid.uuid4().hex[:12]}",
        campaign_id="camp_uq_res_001",
        user_id="user_uq_res_001",
        job_id="job_uq_res_001",
        status="RESERVED",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db_session.add(r1)
    await db_session.commit()

    # Duplicate reservation on (campaign_id, job_id)
    r2 = QuotaReservationModel(
        id=f"res_{uuid.uuid4().hex[:12]}",
        campaign_id="camp_uq_res_001",
        user_id="user_uq_res_001",
        job_id="job_uq_res_001",
        status="RESERVED",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
    )
    db_session.add(r2)

    with pytest.raises(IntegrityError):
        await db_session.commit()

    await db_session.rollback()


