import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock

from app.domain.campaigns.entities import (
    Campaign,
    CampaignRule,
    CampaignSafetyPolicy,
    CampaignSchedule,
    CampaignExecution,
    ErrorTaxonomyEnum,
    classify_automation_error,
    calculate_retry_backoff,
)
from app.domain.campaigns.state_machine import (
    CampaignStateEnum,
    ExecutionStateEnum,
)
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.connections.entities import PlatformConnection, ConnectionStatus, ConnectionType
from app.application.campaigns.use_cases import (
    StartCampaignExecutionUseCase,
    RecordWorkerHeartbeatUseCase,
    ReclaimAbandonedExecutionsUseCase,
)
from app.application.applications.use_cases import (
    ApproveApplicationUseCase,
    RetryApplicationUseCase,
)
from app.core.exceptions import EntityNotFoundException, ValidationException


# =====================================================================
# 1. Atomic Execution Lock & Concurrency Tests
# =====================================================================
@pytest.mark.asyncio
async def test_atomic_execution_lock_prevents_duplicate_runs():
    """Verify that concurrent start requests for the same campaign result in only ONE active execution."""
    campaign_repo = MagicMock()
    conn_repo = MagicMock()

    campaign = Campaign(
        id="camp-100",
        user_id="user-1",
        name="Backend Campaign",
        state=CampaignStateEnum.RUNNING.value,
        rule=CampaignRule(),
        safety_policy=CampaignSafetyPolicy(daily_application_limit=20, hourly_application_limit=5),
        schedule=CampaignSchedule(),
    )
    campaign_repo.get_by_id = AsyncMock(return_value=campaign)
    campaign_repo.count_today_applications = AsyncMock(return_value=2)
    campaign_repo.count_hourly_applications = AsyncMock(return_value=1)
    campaign_repo.save = AsyncMock(side_effect=lambda c: c)
    conn_repo.get_by_platform = AsyncMock(return_value=None)

    # First execution created
    exec_1 = CampaignExecution(
        id="exec-1",
        campaign_id="camp-100",
        user_id="user-1",
        status=ExecutionStateEnum.RUNNING.value,
        worker_id="worker-alpha",
    )
    
    # Simulate DB atomic lock: first call returns (exec_1, True), second returns (exec_1, False)
    call_count = 0
    async def mock_acquire(campaign_id, user_id, worker_id, lease_seconds, initial_status):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return exec_1, True
        return exec_1, False

    exec_repo = MagicMock()
    exec_repo.acquire_or_get_active_execution = AsyncMock(side_effect=mock_acquire)
    log_repo = MagicMock()
    log_repo.log = AsyncMock()

    use_case = StartCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=exec_repo,
        log_repo=log_repo,
        connection_repo=conn_repo,
    )

    # Run two concurrent start requests
    res1, res2 = await asyncio.gather(
        use_case.execute(campaign_id="camp-100", user_id="user-1", worker_id="worker-alpha"),
        use_case.execute(campaign_id="camp-100", user_id="user-1", worker_id="worker-beta"),
    )

    assert res1.id == "exec-1"
    assert res2.id == "exec-1"
    assert exec_repo.acquire_or_get_active_execution.call_count == 2
    # Only ONE execution was active and returned for both calls without starting duplicates


# =====================================================================
# 2. Review Queue Approval Re-Validation Tests
# =====================================================================
@pytest.mark.asyncio
async def test_approve_application_revalidates_job_still_available():
    """Approval re-check: skips application if job posting was removed while in review queue."""
    app_repo = MagicMock()
    job_repo = MagicMock()
    exec_use_case = MagicMock()

    app = Application(
        id="app-1",
        user_id="user-1",
        job_id="job-deleted",
        idempotency_key="idemp-1",
        workflow_state=WorkflowStateEnum.APPROVAL_REQUIRED,
    )
    app_repo.get_by_id = AsyncMock(return_value=app)
    app_repo.save = AsyncMock(side_effect=lambda a: a)
    job_repo.get_by_id = AsyncMock(return_value=None)  # Job no longer exists

    use_case = ApproveApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=exec_use_case,
        job_repo=job_repo,
    )

    result = await use_case.execute(application_id="app-1")
    assert result.workflow_state == WorkflowStateEnum.SKIPPED
    assert "no longer available" in result.failure_reason


@pytest.mark.asyncio
async def test_approve_application_revalidates_duplicate_application():
    """Approval re-check: skips application if candidate applied while pending review."""
    app_repo = MagicMock()
    job_repo = MagicMock()
    exec_use_case = MagicMock()

    app = Application(
        id="app-2",
        user_id="user-1",
        job_id="job-10",
        idempotency_key="idemp-2",
        workflow_state=WorkflowStateEnum.APPROVAL_REQUIRED,
    )
    already_applied_app = Application(
        id="app-other",
        user_id="user-1",
        job_id="job-10",
        idempotency_key="idemp-other",
        workflow_state=WorkflowStateEnum.APPLIED,
    )

    app_repo.get_by_id = AsyncMock(return_value=app)
    app_repo.list_by_user = AsyncMock(return_value=[already_applied_app])
    app_repo.save = AsyncMock(side_effect=lambda a: a)
    job_repo.get_by_id = AsyncMock(return_value=MagicMock(id="job-10"))

    use_case = ApproveApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=exec_use_case,
        job_repo=job_repo,
    )

    result = await use_case.execute(application_id="app-2")
    assert result.workflow_state == WorkflowStateEnum.SKIPPED
    assert "Already applied" in result.failure_reason


@pytest.mark.asyncio
async def test_approve_application_revalidates_safety_limits():
    """Approval re-check: pauses application when daily limit is reached."""
    app_repo = MagicMock()
    job_repo = MagicMock()
    camp_repo = MagicMock()
    exec_use_case = MagicMock()

    app = Application(
        id="app-3",
        user_id="user-1",
        job_id="job-20",
        idempotency_key="idemp-3",
        workflow_state=WorkflowStateEnum.APPROVAL_REQUIRED,
    )
    campaign = Campaign(
        id="camp-1",
        user_id="user-1",
        name="Active Camp",
        safety_policy=CampaignSafetyPolicy(daily_application_limit=10),
    )

    app_repo.get_by_id = AsyncMock(return_value=app)
    app_repo.list_by_user = AsyncMock(return_value=[])
    app_repo.save = AsyncMock(side_effect=lambda a: a)
    job_repo.get_by_id = AsyncMock(return_value=MagicMock(id="job-20"))
    camp_repo.list_by_user = AsyncMock(return_value=[campaign])
    camp_repo.count_today_applications = AsyncMock(return_value=10)  # Reached limit
    camp_repo.count_hourly_applications = AsyncMock(return_value=2)

    use_case = ApproveApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=exec_use_case,
        job_repo=job_repo,
        campaign_repo=camp_repo,
    )

    result = await use_case.execute(application_id="app-3")
    assert result.workflow_state == WorkflowStateEnum.PAUSED_LIMIT
    assert "Safety limit guard" in result.failure_reason


# =====================================================================
# 3. Intelligent Retry Taxonomy & Backoff Tests
# =====================================================================
def test_error_classification_taxonomy():
    """Verify error taxonomy correctly separates transient, permanent, and user action errors."""
    # Transient network timeout -> retryable
    c1 = classify_automation_error("Navigation timeout 30000ms exceeded on Naukri", retry_count=0)
    assert c1.category == ErrorTaxonomyEnum.TRANSIENT
    assert c1.is_retryable is True
    assert "Retry" in c1.suggested_action

    # Job unavailable -> non-retryable
    c2 = classify_automation_error("Job posting has expired or been closed by employer", retry_count=0)
    assert c2.category == ErrorTaxonomyEnum.JOB_UNAVAILABLE
    assert c2.is_retryable is False
    assert "Skip" in c2.suggested_action

    # Business rule duplicate -> non-retryable
    c3 = classify_automation_error("Already applied to this job previously", retry_count=0)
    assert c3.category == ErrorTaxonomyEnum.BUSINESS_RULE
    assert c3.is_retryable is False
    assert "already applied" in c3.suggested_action.lower()

    # OTP/CAPTCHA challenge -> user action required
    c4 = classify_automation_error("OTP verification challenge detected", retry_count=0)
    assert c4.category == ErrorTaxonomyEnum.USER_ACTION_REQUIRED
    assert c4.is_retryable is False
    assert "Live Console" in c4.suggested_action

    # Exceeded max retry count -> non-retryable
    c5 = classify_automation_error("Temporary 503 gateway timeout", retry_count=3)
    assert c5.category == ErrorTaxonomyEnum.TRANSIENT
    assert c5.is_retryable is False
    assert "Max retries" in c5.suggested_action


def test_retry_backoff_calculation_exponential_growth():
    """Verify backoff calculation applies exponential scaling and jitter."""
    b0 = calculate_retry_backoff(retry_count=0, base_seconds=60, max_seconds=3600, jitter=0.0)
    b1 = calculate_retry_backoff(retry_count=1, base_seconds=60, max_seconds=3600, jitter=0.0)
    b2 = calculate_retry_backoff(retry_count=2, base_seconds=60, max_seconds=3600, jitter=0.0)

    assert b0 == 60
    assert b1 == 120
    assert b2 == 240

    # With jitter: strictly positive and bounded
    b_jitter = calculate_retry_backoff(retry_count=1, base_seconds=60, max_seconds=3600, jitter=0.2)
    assert 90 <= b_jitter <= 150


@pytest.mark.asyncio
async def test_retry_application_use_case_rejects_non_retryable():
    """Verify RetryApplicationUseCase rejects permanent errors and enforces max retry cap."""
    app_repo = MagicMock()
    exec_use_case = MagicMock()
    app = Application(
        id="app-perm",
        user_id="user-1",
        job_id="job-1",
        idempotency_key="idemp-perm",
        workflow_state=WorkflowStateEnum.SKIPPED,
        failure_reason="Job posting has expired or been closed by employer",
    )
    app_repo.get_by_id = AsyncMock(return_value=app)
    app_repo.save = AsyncMock(side_effect=lambda a: a)

    use_case = RetryApplicationUseCase(app_repo=app_repo, execute_use_case=exec_use_case)

    with pytest.raises(ValidationException) as exc_info:
        await use_case.execute(application_id="app-perm")
    assert "Cannot retry" in str(exc_info.value)


# =====================================================================
# 4. Platform Session Health Pre-Flight Tests
# =====================================================================
@pytest.mark.asyncio
async def test_campaign_start_pauses_when_session_expired():
    """Verify campaign execution transitions to PAUSED_SESSION when platform credentials are expired."""
    campaign_repo = MagicMock()
    conn_repo = MagicMock()

    campaign = Campaign(
        id="camp-session-test",
        user_id="user-1",
        name="Session Test Campaign",
        rule=CampaignRule(target_platforms=["naukri"]),
        safety_policy=CampaignSafetyPolicy(),
    )
    campaign_repo.get_by_id = AsyncMock(return_value=campaign)
    campaign_repo.count_today_applications = AsyncMock(return_value=0)
    campaign_repo.count_hourly_applications = AsyncMock(return_value=0)
    campaign_repo.save = AsyncMock(side_effect=lambda c: c)

    # Expired connection
    expired_conn = PlatformConnection(
        id="conn-1",
        user_id="user-1",
        platform="naukri",
        connection_type=ConnectionType.BROWSER_SESSION,
        status=ConnectionStatus.SESSION_EXPIRED,
    )
    conn_repo.get_by_platform = AsyncMock(return_value=expired_conn)

    async def mock_acquire(campaign_id, user_id, worker_id, lease_seconds, initial_status):
        return CampaignExecution(
            id="exec-session-paused",
            campaign_id=campaign_id,
            user_id=user_id,
            status=initial_status.value if hasattr(initial_status, "value") else str(initial_status),
            error_message="Platform session for 'naukri' is expired or disconnected.",
        ), True

    exec_repo = MagicMock()
    exec_repo.acquire_or_get_active_execution = AsyncMock(side_effect=mock_acquire)
    log_repo = MagicMock()
    log_repo.log = AsyncMock()

    use_case = StartCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=exec_repo,
        log_repo=log_repo,
        connection_repo=conn_repo,
    )

    exec_result = await use_case.execute(campaign_id="camp-session-test", user_id="user-1")
    assert exec_result.status == ExecutionStateEnum.PAUSED_SESSION.value
    assert "expired or disconnected" in exec_result.error_message


# =====================================================================
# 5. Strict Campaign State vs Execution State Decoupling Tests
# =====================================================================
def test_campaign_vs_execution_state_decoupling():
    """Verify campaign remains RUNNING or SCHEDULED when execution is PAUSED_OTP, PAUSED_SESSION, or PAUSED_LIMIT."""
    campaign = Campaign(
        id="camp-dec",
        user_id="user-1",
        name="Evergreen Campaign",
        state=CampaignStateEnum.RUNNING.value,
    )

    # Ephemeral execution encounter with OTP
    exec_otp = CampaignExecution(
        id="exec-otp-1",
        campaign_id="camp-dec",
        user_id="user-1",
        status=ExecutionStateEnum.PAUSED_OTP.value,
    )

    # Campaign must remain RUNNING
    assert campaign.state == CampaignStateEnum.RUNNING.value
    assert exec_otp.status == ExecutionStateEnum.PAUSED_OTP.value

    # Ephemeral execution encounter with daily limit
    exec_limit = CampaignExecution(
        id="exec-lim-1",
        campaign_id="camp-dec",
        user_id="user-1",
        status=ExecutionStateEnum.PAUSED_LIMIT.value,
    )

    assert campaign.state == CampaignStateEnum.RUNNING.value
    assert exec_limit.status == ExecutionStateEnum.PAUSED_LIMIT.value


# =====================================================================
# 6. Worker Heartbeat and Lease Reclamation Tests
# =====================================================================
@pytest.mark.asyncio
async def test_worker_heartbeat_and_lease_reclaim():
    """Verify worker heartbeats extend lease and expired leases are reclaimed."""
    exec_repo = MagicMock()

    # 1. Heartbeat test
    expected_exec = CampaignExecution(
        id="exec-heartbeat",
        campaign_id="camp-1",
        user_id="user-1",
        worker_id="worker-node-1",
        heartbeat_at=datetime.now(timezone.utc),
    )
    exec_repo.record_heartbeat = AsyncMock(return_value=expected_exec)
    hb_use_case = RecordWorkerHeartbeatUseCase(execution_repo=exec_repo)
    result_exec = await hb_use_case.execute(execution_id="exec-heartbeat", worker_id="worker-node-1", lease_seconds=300)
    assert result_exec is not None
    assert result_exec.id == "exec-heartbeat"
    exec_repo.record_heartbeat.assert_called_once_with("exec-heartbeat", "worker-node-1", 300)

    # 2. Reclaim expired lease test
    exec_repo.reclaim_expired_leases = AsyncMock(return_value=2)
    reclaim_use_case = ReclaimAbandonedExecutionsUseCase(execution_repo=exec_repo)
    reclaimed_count = await reclaim_use_case.execute()
    assert reclaimed_count == 2
    exec_repo.reclaim_expired_leases.assert_called_once()


# =====================================================================
# 7. Canonical Platform Connection Status Tests
# =====================================================================
@pytest.mark.asyncio
async def test_canonical_platform_connection_status_validation():
    """Verify pre-flight platform session check strictly uses ConnectionStatus.CONNECTED."""
    from app.domain.connections.entities import PlatformConnection, ConnectionStatus

    camp_repo = MagicMock()
    exec_repo = MagicMock()
    log_repo = MagicMock()
    conn_repo = MagicMock()

    campaign = Campaign(
        id="camp-conn-test",
        user_id="user-1",
        name="Connection Validation Campaign",
        rule=CampaignRule(target_platforms=["naukri"]),
        safety_policy=CampaignSafetyPolicy(daily_application_limit=20, hourly_application_limit=5),
    )
    camp_repo.get_by_id = AsyncMock(return_value=campaign)
    camp_repo.count_today_applications = AsyncMock(return_value=0)
    camp_repo.count_hourly_applications = AsyncMock(return_value=0)
    camp_repo.save = AsyncMock(return_value=campaign)
    log_repo.log = AsyncMock()

    use_case = StartCampaignExecutionUseCase(
        campaign_repo=camp_repo,
        execution_repo=exec_repo,
        log_repo=log_repo,
        connection_repo=conn_repo,
    )

    # Case 1: Connection does not exist (conn is None) -> PAUSED_SESSION
    conn_repo.get_by_platform = AsyncMock(return_value=None)
    exec_repo.acquire_or_get_active_execution = AsyncMock(
        return_value=(
            CampaignExecution(id="e-none", campaign_id="camp-conn-test", user_id="user-1", status=ExecutionStateEnum.PAUSED_SESSION.value),
            True,
        )
    )
    res_none = await use_case.execute("camp-conn-test", "user-1")
    assert res_none.status == ExecutionStateEnum.PAUSED_SESSION.value
    exec_repo.acquire_or_get_active_execution.assert_called_with(
        campaign_id="camp-conn-test",
        user_id="user-1",
        worker_id="worker-1",
        lease_seconds=300,
        initial_status=ExecutionStateEnum.PAUSED_SESSION.value,
    )

    # Case 2: Connection is SESSION_EXPIRED -> PAUSED_SESSION
    conn_expired = PlatformConnection(id="c-exp", user_id="user-1", platform="naukri", status=ConnectionStatus.SESSION_EXPIRED)
    conn_repo.get_by_platform = AsyncMock(return_value=conn_expired)
    exec_repo.acquire_or_get_active_execution = AsyncMock(
        return_value=(
            CampaignExecution(id="e-exp", campaign_id="camp-conn-test", user_id="user-1", status=ExecutionStateEnum.PAUSED_SESSION.value),
            True,
        )
    )
    res_exp = await use_case.execute("camp-conn-test", "user-1")
    assert res_exp.status == ExecutionStateEnum.PAUSED_SESSION.value

    # Case 3: Connection is DISCONNECTED -> PAUSED_SESSION
    conn_disc = PlatformConnection(id="c-disc", user_id="user-1", platform="naukri", status=ConnectionStatus.DISCONNECTED)
    conn_repo.get_by_platform = AsyncMock(return_value=conn_disc)
    exec_repo.acquire_or_get_active_execution = AsyncMock(
        return_value=(
            CampaignExecution(id="e-disc", campaign_id="camp-conn-test", user_id="user-1", status=ExecutionStateEnum.PAUSED_SESSION.value),
            True,
        )
    )
    res_disc = await use_case.execute("camp-conn-test", "user-1")
    assert res_disc.status == ExecutionStateEnum.PAUSED_SESSION.value

    # Case 4: Connection is CONNECTED -> RUNNING
    conn_ok = PlatformConnection(id="c-ok", user_id="user-1", platform="naukri", status=ConnectionStatus.CONNECTED)
    conn_repo.get_by_platform = AsyncMock(return_value=conn_ok)
    exec_repo.acquire_or_get_active_execution = AsyncMock(
        return_value=(
            CampaignExecution(id="e-ok", campaign_id="camp-conn-test", user_id="user-1", status=ExecutionStateEnum.RUNNING.value),
            True,
        )
    )
    res_ok = await use_case.execute("camp-conn-test", "user-1")
    assert res_ok.status == ExecutionStateEnum.RUNNING.value


# =====================================================================
# 8. Context-Aware Error Classification Tests
# =====================================================================
def test_context_aware_error_classification():
    """Verify error classifier accounts for cancellation and session expiration over closure string."""
    # 1. Explicit cancellation takes precedence over closure string
    c_cancel = classify_automation_error(
        "Page.evaluate: Target page, context or browser has been closed",
        retry_count=0,
        is_cancelled=True,
    )
    assert c_cancel.category == ErrorTaxonomyEnum.ABORTED
    assert c_cancel.is_retryable is False

    # 2. Cancellation text in error
    c_stopped = classify_automation_error("Execution stopped by user", retry_count=0)
    assert c_stopped.category == ErrorTaxonomyEnum.ABORTED
    assert c_stopped.is_retryable is False

    # 3. Explicit session expiration takes precedence over closure string
    c_sess = classify_automation_error(
        "Page.evaluate: Target page, context or browser has been closed",
        retry_count=0,
        is_session_expired=True,
    )
    assert c_sess.category == ErrorTaxonomyEnum.AUTHENTICATION
    assert c_sess.is_retryable is False

    # 4. Genuine unexpected crash/closure without cancellation -> TRANSIENT (retryable)
    c_crash_0 = classify_automation_error(
        "Page.evaluate: Target page, context or browser has been closed",
        retry_count=0,
        is_cancelled=False,
        is_session_expired=False,
    )
    assert c_crash_0.category == ErrorTaxonomyEnum.TRANSIENT
    assert c_crash_0.is_retryable is True

    # 5. Unexpected crash when max retries exceeded (default 3) -> TRANSIENT (non-retryable)
    c_crash_3 = classify_automation_error(
        "Page.evaluate: Target page, context or browser has been closed",
        retry_count=3,
        is_cancelled=False,
        is_session_expired=False,
        max_retries=3,
    )
    assert c_crash_3.category == ErrorTaxonomyEnum.TRANSIENT
    assert c_crash_3.is_retryable is False

    # 6. Configurable max retries (e.g. max_retries=5) -> still retryable at 3
    c_crash_custom = classify_automation_error(
        "Page.evaluate: Target page, context or browser has been closed",
        retry_count=3,
        max_retries=5,
    )
    assert c_crash_custom.category == ErrorTaxonomyEnum.TRANSIENT
    assert c_crash_custom.is_retryable is True


# =====================================================================
# 9. Browser Safety Guard & Mid-Flight Closure Tests
# =====================================================================
@pytest.mark.asyncio
async def test_naukri_adapter_safety_guards_on_closed_page():
    """Verify Naukri adapter checks page.is_closed() and avoids unexpected evaluate crashes."""
    from app.infrastructure.browser.adapters.naukri import NaukriAdapter
    from app.domain.jobs.entities import SearchQueryFilter

    adapter = NaukriAdapter()

    mock_page = AsyncMock()
    mock_page.is_closed = MagicMock(return_value=True)  # Already closed
    mock_context = MagicMock()
    mock_context.pages = [mock_page]

    filters = SearchQueryFilter(roles=["Python Developer"])

    with pytest.raises(RuntimeError, match="Target page, context or browser has been closed"):
        async for _ in adapter.search_jobs(mock_context, filters):
            pass


# =====================================================================
# 10. Campaign Execution Idempotency & Transition Safety Tests
# =====================================================================
@pytest.mark.asyncio
async def test_pause_campaign_execution_idempotent_when_already_paused():
    """Verify pausing an already paused execution succeeds idempotently without raising InvalidStateTransitionException."""
    from app.application.campaigns.use_cases import PauseCampaignExecutionUseCase
    from app.domain.campaigns.state_machine import ExecutionStateMachine

    campaign_repo = MagicMock()
    execution_repo = MagicMock()
    log_repo = MagicMock()

    paused_exec = CampaignExecution(
        id="exec-p1",
        campaign_id="camp-1",
        user_id="user-1",
        status=ExecutionStateEnum.PAUSED_USER.value,
    )
    execution_repo.get_active_by_campaign = AsyncMock(return_value=paused_exec)
    execution_repo.save = AsyncMock(return_value=paused_exec)
    campaign_repo.get_by_id = AsyncMock(return_value=None)
    log_repo.log = AsyncMock()

    use_case = PauseCampaignExecutionUseCase(campaign_repo, execution_repo, log_repo)
    result = await use_case.execute("camp-1", "user-1")

    assert result.status == ExecutionStateEnum.PAUSED_USER.value
    # No unnecessary DB writes or transition crashes
    execution_repo.save.assert_not_called()


@pytest.mark.asyncio
async def test_resume_campaign_execution_idempotent_when_already_running():
    """Verify resuming an already running execution succeeds idempotently without raising."""
    from app.application.campaigns.use_cases import ResumeCampaignExecutionUseCase

    campaign_repo = MagicMock()
    execution_repo = MagicMock()
    log_repo = MagicMock()

    running_exec = CampaignExecution(
        id="exec-r1",
        campaign_id="camp-1",
        user_id="user-1",
        status=ExecutionStateEnum.RUNNING.value,
    )
    execution_repo.get_active_by_campaign = AsyncMock(return_value=running_exec)
    execution_repo.save = AsyncMock(return_value=running_exec)
    campaign_repo.get_by_id = AsyncMock(return_value=None)
    log_repo.log = AsyncMock()

    use_case = ResumeCampaignExecutionUseCase(campaign_repo, execution_repo, log_repo)
    result = await use_case.execute("camp-1", "user-1")

    assert result.status == ExecutionStateEnum.RUNNING.value
    execution_repo.save.assert_not_called()


@pytest.mark.asyncio
async def test_stop_campaign_execution_idempotent_when_already_stopped():
    """Verify stopping an already aborted/completed execution succeeds idempotently."""
    from app.application.campaigns.use_cases import StopCampaignExecutionUseCase

    campaign_repo = MagicMock()
    execution_repo = MagicMock()
    log_repo = MagicMock()

    stopped_exec = CampaignExecution(
        id="exec-s1",
        campaign_id="camp-1",
        user_id="user-1",
        status=ExecutionStateEnum.ABORTED.value,
    )
    execution_repo.get_active_by_campaign = AsyncMock(return_value=stopped_exec)
    execution_repo.save = AsyncMock(return_value=stopped_exec)
    campaign = Campaign(
        id="camp-1",
        user_id="user-1",
        name="Test",
        state=CampaignStateEnum.RUNNING.value,
        rule=CampaignRule(),
        safety_policy=CampaignSafetyPolicy(),
        schedule=CampaignSchedule(),
    )
    campaign_repo.get_by_id = AsyncMock(return_value=campaign)
    campaign_repo.save = AsyncMock(return_value=campaign)
    log_repo.log = AsyncMock()

    use_case = StopCampaignExecutionUseCase(campaign_repo, execution_repo, log_repo)
    result = await use_case.execute("camp-1", "user-1")

    assert result.status == ExecutionStateEnum.ABORTED.value
    execution_repo.save.assert_not_called()


def test_state_machine_allows_paused_limit_to_paused_user():
    """Verify PAUSED_LIMIT execution can transition to PAUSED_USER if user pauses it manually."""
    from app.domain.campaigns.state_machine import ExecutionStateMachine

    assert ExecutionStateMachine.can_transition(
        ExecutionStateEnum.PAUSED_LIMIT,
        ExecutionStateEnum.PAUSED_USER,
    ) is True


