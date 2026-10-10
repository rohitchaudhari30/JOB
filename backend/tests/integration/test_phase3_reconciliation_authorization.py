import pytest
import uuid
from datetime import datetime, timezone
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.core.exceptions import AuthorizationException
from app.domain.applications.entities import (
    Application,
    WorkflowStateEnum,
    ApplicationOutcomeStatus,
)
from app.infrastructure.database.models.models import (
    ApplicationModel,
    JobModel,
    JobSourceModel,
    UserModel,
)
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
from app.application.applications.use_cases import (
    ReconcileApplicationUseCase,
    RetryApplicationUseCase,
)


def _make_job(job_id: str, external_job_id: str, title: str = "Test Role") -> JobModel:
    return JobModel(
        id=job_id,
        source_id="naukri",
        external_job_id=external_job_id,
        title=title,
        company="Acme Corp",
        location="Remote",
        apply_url=f"https://example.com/jobs/{job_id}",
        raw_description="Job description for test",
        is_active=True,
    )


async def _setup_test_environment(db_session: AsyncSession) -> dict:
    """Creates initial job source, job, users, and returns plain IDs and headers."""
    # Ensure source exists
    source = await db_session.get(JobSourceModel, "naukri")
    if not source:
        source = JobSourceModel(
            id="naukri",
            source_type="naukri",
            base_url="https://www.naukri.com",
            is_active=True,
        )
        db_session.add(source)

    # Job
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    job = _make_job(
        job_id=job_id,
        external_job_id=f"ext_{uuid.uuid4().hex[:8]}",
        title="Senior Security Architect",
    )
    db_session.add(job)

    # User A (Application Owner)
    user_a_id = f"usr_a_{uuid.uuid4().hex[:10]}"
    user_a = UserModel(
        id=user_a_id,
        email=f"user_a_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="User Alpha (Owner)",
        is_active=True,
        is_superuser=False,
    )
    db_session.add(user_a)

    # User B (Different User / Tenant)
    user_b_id = f"usr_b_{uuid.uuid4().hex[:10]}"
    user_b = UserModel(
        id=user_b_id,
        email=f"user_b_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="User Beta (Intruder)",
        is_active=True,
        is_superuser=False,
    )
    db_session.add(user_b)

    # Admin User (Superuser)
    admin_id = f"usr_admin_{uuid.uuid4().hex[:10]}"
    admin_user = UserModel(
        id=admin_id,
        email=f"admin_{uuid.uuid4().hex[:6]}@example.com",
        hashed_password=get_password_hash("Password123!"),
        full_name="Admin User",
        is_active=True,
        is_superuser=True,
    )
    db_session.add(admin_user)

    await db_session.commit()

    token_a = create_access_token({"sub": user_a_id})
    token_b = create_access_token({"sub": user_b_id})
    token_admin = create_access_token({"sub": admin_id})

    return {
        "job_id": job_id,
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "admin_id": admin_id,
        "headers_a": {"Authorization": f"Bearer {token_a}"},
        "headers_b": {"Authorization": f"Bearer {token_b}"},
        "headers_admin": {"Authorization": f"Bearer {token_admin}"},
    }


def _make_reconciliation_app(user_id: str, job_id: str, state: str = "RECONCILIATION_REQUIRED") -> ApplicationModel:
    return ApplicationModel(
        id=f"app_{uuid.uuid4().hex[:12]}",
        user_id=user_id,
        job_id=job_id,
        idempotency_key=f"idem_{uuid.uuid4().hex[:12]}",
        workflow_state=state,
        outcome_status="NOT_SUBMITTED",
        failure_reason="Browser crashed right after submission click; external status uncertain",
        retry_count=0,
        current_attempt_id=f"att_{uuid.uuid4().hex[:8]}",
    )


# =========================================================================
# TEST 1: Unauthenticated Users Cannot Reconcile Applications (HTTP 401)
# =========================================================================
@pytest.mark.asyncio
async def test_reconciliation_unauthenticated_blocked(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that unauthenticated requests (no token or invalid token) to
    reconciliation endpoints are rejected with HTTP 401 Unauthorized,
    and no state transitions occur in the database.
    """
    ctx = await _setup_test_environment(db_session)
    app_a = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=ctx["job_id"])
    db_session.add(app_a)
    await db_session.commit()

    # 1. No Authorization header
    resp_no_auth = await client.post(
        f"/api/v1/applications/{app_a.id}/reconcile",
        json={"action": "CONFIRM_SUBMITTED"},
    )
    assert resp_no_auth.status_code == 401
    assert "detail" in resp_no_auth.json()

    # 2. Invalid Bearer token
    resp_bad_auth = await client.post(
        f"/api/v1/applications/{app_a.id}/reconcile",
        json={"action": "CONFIRM_SUBMITTED"},
        headers={"Authorization": "Bearer invalid_garbage_token"},
    )
    assert resp_bad_auth.status_code == 401

    # 3. Verify application state in database remains strictly unmodified
    await db_session.refresh(app_a)
    assert app_a.workflow_state == "RECONCILIATION_REQUIRED"
    assert app_a.applied_at is None


# =========================================================================
# TEST 2: Cross-User IDOR Rejection Across All Reconciliation Actions (HTTP 403)
# =========================================================================
@pytest.mark.asyncio
async def test_reconciliation_cross_user_idor_blocked_all_actions(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that User B cannot confirm, dismiss, mark not submitted, or retry
    User A's application, receiving HTTP 403 Forbidden with zero details leaked.
    """
    ctx = await _setup_test_environment(db_session)
    app_a = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=ctx["job_id"])
    db_session.add(app_a)
    await db_session.commit()

    actions_to_test = [
        "CONFIRM_SUBMITTED",
        "DISMISS",
        "MARK_NOT_SUBMITTED",
        "MARK_NOT_SUBMITTED_AND_RETRY",
    ]

    for action in actions_to_test:
        resp = await client.post(
            f"/api/v1/applications/{app_a.id}/reconcile",
            json={"action": action, "notes": f"Malicious action attempt {action}"},
            headers=ctx["headers_b"],
        )
        assert resp.status_code == 403, f"Action {action} should have been forbidden for User B"
        body = resp.json()
        assert body["detail"] == "Unauthorized access to this application record."
        # Verify no sensitive application details are exposed in the error payload
        assert "job_title" not in body
        assert "user_id" not in body
        assert "apply_url" not in body

        # Ensure DB state is unchanged
        await db_session.refresh(app_a)
        assert app_a.workflow_state == "RECONCILIATION_REQUIRED"
        assert app_a.outcome_status == "NOT_SUBMITTED"
        assert app_a.applied_at is None
        assert app_a.retry_count == 0


# =========================================================================
# TEST 3: Untrusted Payload Body Spoofing Blocked (Derived From Server Auth)
# =========================================================================
@pytest.mark.asyncio
async def test_reconciliation_payload_tampering_ignored(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that passing an untrusted user_id, applicant_id, or tenant_id in
    the request body does not grant authorization. The server strictly binds
    authorization to current_user.id extracted from the authenticated JWT.
    """
    ctx = await _setup_test_environment(db_session)
    app_a = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=ctx["job_id"])
    db_session.add(app_a)
    await db_session.commit()

    # User B sends request attempting to spoof user_a's ID in payload body
    spoofed_payload = {
        "action": "CONFIRM_SUBMITTED",
        "user_id": ctx["user_a_id"],
        "applicant_id": ctx["user_a_id"],
        "tenant_id": "tenant_a_spoofed",
        "notes": "Trying to bypass authorization with body fields",
    }

    resp = await client.post(
        f"/api/v1/applications/{app_a.id}/reconcile",
        json=spoofed_payload,
        headers=ctx["headers_b"],
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Unauthorized access to this application record."

    await db_session.refresh(app_a)
    assert app_a.workflow_state == "RECONCILIATION_REQUIRED"


# =========================================================================
# TEST 4: Legitimate Owner Reconciliation Actions Succeed (HTTP 200)
# =========================================================================
@pytest.mark.asyncio
async def test_reconciliation_legitimate_owner_actions_succeed(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that legitimate application owners can successfully execute each
    reconciliation action on their own applications.
    """
    ctx = await _setup_test_environment(db_session)

    # 1. Action: CONFIRM_SUBMITTED
    app_1 = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=ctx["job_id"])
    db_session.add(app_1)
    await db_session.commit()

    resp_confirm = await client.post(
        f"/api/v1/applications/{app_1.id}/reconcile",
        json={"action": "CONFIRM_SUBMITTED", "notes": "Verified receipt in external portal"},
        headers=ctx["headers_a"],
    )
    assert resp_confirm.status_code == 200
    data_1 = resp_confirm.json()
    assert data_1["workflow_state"] == "APPLIED"
    assert data_1["applied_at"] is not None

    await db_session.refresh(app_1)
    assert app_1.workflow_state == "APPLIED"
    assert app_1.outcome_status == "SUBMITTED"
    assert app_1.applied_at is not None

    # 2. Action: DISMISS
    job_2_id = f"job_2_{uuid.uuid4().hex[:8]}"
    job_2 = _make_job(job_id=job_2_id, external_job_id=f"ext_{uuid.uuid4().hex[:8]}", title="Backend Engineer")
    db_session.add(job_2)
    app_2 = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=job_2_id)
    db_session.add(app_2)
    await db_session.commit()

    resp_dismiss = await client.post(
        f"/api/v1/applications/{app_2.id}/reconcile",
        json={"action": "DISMISS", "notes": "Job was expired externally"},
        headers=ctx["headers_a"],
    )
    assert resp_dismiss.status_code == 200
    assert resp_dismiss.json()["workflow_state"] == "SKIPPED"

    await db_session.refresh(app_2)
    assert app_2.workflow_state == "SKIPPED"

    # 3. Action: MARK_NOT_SUBMITTED
    job_3_id = f"job_3_{uuid.uuid4().hex[:8]}"
    job_3 = _make_job(job_id=job_3_id, external_job_id=f"ext_{uuid.uuid4().hex[:8]}", title="Full Stack Engineer")
    db_session.add(job_3)
    app_3 = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=job_3_id)
    db_session.add(app_3)
    await db_session.commit()

    resp_not_sub = await client.post(
        f"/api/v1/applications/{app_3.id}/reconcile",
        json={"action": "MARK_NOT_SUBMITTED", "notes": "No submission was made"},
        headers=ctx["headers_a"],
    )
    assert resp_not_sub.status_code == 200
    assert resp_not_sub.json()["workflow_state"] == "FAILED"

    await db_session.refresh(app_3)
    assert app_3.workflow_state == "FAILED"
    assert app_3.outcome_status == "NOT_SUBMITTED"


# =========================================================================
# TEST 5: Administrator Superuser Access Allowed
# =========================================================================
@pytest.mark.asyncio
async def test_reconciliation_admin_superuser_access(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that an administrator account with is_superuser=True can reconcile
    an application on behalf of a user when authorized operations are needed.
    """
    ctx = await _setup_test_environment(db_session)
    app_a = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=ctx["job_id"])
    db_session.add(app_a)
    await db_session.commit()

    resp_admin = await client.post(
        f"/api/v1/applications/{app_a.id}/reconcile",
        json={"action": "CONFIRM_SUBMITTED", "notes": "Admin verified external portal submission log"},
        headers=ctx["headers_admin"],
    )
    assert resp_admin.status_code == 200
    data = resp_admin.json()
    assert data["workflow_state"] == "APPLIED"
    assert data["applied_at"] is not None

    await db_session.refresh(app_a)
    assert app_a.workflow_state == "APPLIED"
    assert app_a.outcome_status == "SUBMITTED"


# =========================================================================
# TEST 6: Unauthorized Retry Attempts Blocked from Queue and Execution
# =========================================================================
@pytest.mark.asyncio
async def test_unauthorized_retry_attempts_blocked_from_execution_and_queue(client: AsyncClient, db_session: AsyncSession):
    """
    Verify that User B cannot trigger a retry (neither via /retry nor via
    reconciliation MARK_NOT_SUBMITTED_AND_RETRY) on User A's application.
    Ensure retry count does not increment and state remains unchanged.
    """
    ctx = await _setup_test_environment(db_session)

    # 1. Failed application retry test
    app_failed = ApplicationModel(
        id=f"app_f_{uuid.uuid4().hex[:12]}",
        user_id=ctx["user_a_id"],
        job_id=ctx["job_id"],
        idempotency_key=f"idem_f_{uuid.uuid4().hex[:12]}",
        workflow_state="FAILED",
        outcome_status="NOT_SUBMITTED",
        failure_reason="Transient network error",
        retry_count=1,
    )
    db_session.add(app_failed)
    await db_session.commit()

    retry_resp = await client.post(
        f"/api/v1/applications/{app_failed.id}/retry",
        headers=ctx["headers_b"],
    )
    assert retry_resp.status_code == 403

    await db_session.refresh(app_failed)
    assert app_failed.workflow_state == "FAILED"
    assert app_failed.retry_count == 1

    # 2. Reconciliation MARK_NOT_SUBMITTED_AND_RETRY attempt
    job_extra_id = f"job_ex_{uuid.uuid4().hex[:8]}"
    job_extra = _make_job(job_id=job_extra_id, external_job_id=f"ext_{uuid.uuid4().hex[:8]}", title="Data Engineer")
    db_session.add(job_extra)

    app_recon = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=job_extra_id)
    db_session.add(app_recon)
    await db_session.commit()

    recon_retry_resp = await client.post(
        f"/api/v1/applications/{app_recon.id}/reconcile",
        json={"action": "MARK_NOT_SUBMITTED_AND_RETRY"},
        headers=ctx["headers_b"],
    )
    assert recon_retry_resp.status_code == 403

    await db_session.refresh(app_recon)
    assert app_recon.workflow_state == "RECONCILIATION_REQUIRED"
    assert app_recon.retry_count == 0


# =========================================================================
# TEST 7: Domain Use Case Level Ownership Enforcement (Defense-in-Depth)
# =========================================================================
@pytest.mark.asyncio
async def test_use_case_level_ownership_enforcement(db_session: AsyncSession):
    """
    Verify that the application use cases themselves (ReconcileApplicationUseCase
    and RetryApplicationUseCase) enforce ownership when user_id is provided,
    raising AuthorizationException if called with an unauthorized user ID.
    """
    ctx = await _setup_test_environment(db_session)
    app_a = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=ctx["job_id"])
    db_session.add(app_a)
    await db_session.commit()

    app_repo = SqlAlchemyApplicationRepository(db_session)
    recon_uc = ReconcileApplicationUseCase(app_repo=app_repo)
    retry_uc = RetryApplicationUseCase(app_repo=app_repo, execute_use_case=None)

    # 1. Reconcile with unauthorized user_id raises AuthorizationException
    with pytest.raises(AuthorizationException):
        await recon_uc.execute(
            application_id=app_a.id,
            action="CONFIRM_SUBMITTED",
            user_id=ctx["user_b_id"],
            is_admin=False,
        )

    # 2. Retry with unauthorized user_id raises AuthorizationException
    with pytest.raises(AuthorizationException):
        await retry_uc.execute(
            application_id=app_a.id,
            user_id=ctx["user_b_id"],
            is_admin=False,
        )

    # 3. Reconcile with authorized user_id succeeds
    res_owner = await recon_uc.execute(
        application_id=app_a.id,
        action="CONFIRM_SUBMITTED",
        user_id=ctx["user_a_id"],
        is_admin=False,
    )
    assert res_owner.workflow_state == WorkflowStateEnum.APPLIED

    # 4. Reconcile with admin superuser flag succeeds even for different user_id
    job_extra2_id = f"job_ex2_{uuid.uuid4().hex[:8]}"
    job_extra2 = _make_job(job_extra2_id, f"ext_{uuid.uuid4().hex[:8]}", "ML Engineer")
    db_session.add(job_extra2)

    app_a2 = _make_reconciliation_app(user_id=ctx["user_a_id"], job_id=job_extra2_id)
    db_session.add(app_a2)
    await db_session.commit()

    res_admin = await recon_uc.execute(
        application_id=app_a2.id,
        action="CONFIRM_SUBMITTED",
        user_id=ctx["admin_id"],
        is_admin=True,
    )
    assert res_admin.workflow_state == WorkflowStateEnum.APPLIED
