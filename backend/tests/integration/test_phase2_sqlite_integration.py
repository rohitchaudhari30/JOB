import asyncio
import os
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.core.exceptions import ValidationException
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
    CandidateProfileModel,
    ResumeModel,
)
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository


def _make_job(job_id: str, external_job_id: str, title: str = "Test Engineer") -> JobModel:
    return JobModel(
        id=job_id,
        source_id="naukri",
        external_job_id=external_job_id,
        title=title,
        company="Acme Corp",
        location="Remote",
        apply_url="https://example.com/jobs/1",
        raw_description="Job description for test",
        is_active=True,
    )


# =========================================================================
# TEST 1: Verify Test Isolation (Dev Database Untouched)
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_environment_isolation(db_session: AsyncSession):
    """
    Verify that the test suite is strictly executing against an isolated
    in-memory SQLite database, and the configured dev app.db is never
    connected to or mutated by the test session.
    """
    # 1. Inspect active connection URL
    bind = db_session.bind
    assert bind is not None
    db_url_str = str(bind.url)
    assert "sqlite" in db_url_str
    assert ":memory:" in db_url_str or "%3Amemory%3A" in db_url_str, f"Expected in-memory SQLite for tests, but got {db_url_str}"

    # 2. Confirm dev database URL is distinctly separate
    assert settings.DATABASE_URL != db_url_str
    assert "app.db" in settings.DATABASE_URL or "automation.db" in settings.DATABASE_URL


# =========================================================================
# TEST 2: Affected-Row Counts and Conditional Update Rejection
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_affected_rowcount_and_conditional_fencing(db_session: AsyncSession):
    """
    Verify that SQLite conditional SQL updates accurately report affected rowcount:
    - Exactly 1 when expected_state and attempt_id match.
    - Exactly 0 when expected_state mismatches, causing ValidationException.
    """
    repo = SqlAlchemyApplicationRepository(session=db_session)
    app_id = f"app_rowcount_{uuid.uuid4().hex[:8]}"
    user_id = f"user_rowcount_{uuid.uuid4().hex[:8]}"
    job_id = f"job_rowcount_{uuid.uuid4().hex[:8]}"

    # Setup parent records
    user = UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="pw", is_active=True)
    job = _make_job(job_id=job_id, external_job_id=f"ext_{user_id}", title="Test Engineer")
    db_session.add_all([user, job])
    await db_session.flush()

    # Create initial application in SUBMITTING with attempt att_01
    model = ApplicationModel(
        id=app_id,
        user_id=user_id,
        job_id=job_id,
        idempotency_key=f"idem_{app_id}",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        current_attempt_id="att_01",
    )
    db_session.add(model)
    await db_session.commit()

    # Case A: Conditional update with matching expected_state and expected_attempt_id
    app_entity = await repo.get_by_id(app_id)
    assert app_entity is not None
    app_entity.workflow_state = WorkflowStateEnum.APPLIED
    app_entity.outcome_status = ApplicationOutcomeStatus.SUBMITTED
    app_entity.applied_at = datetime.now(timezone.utc)

    saved = await repo.save(
        app_entity,
        expected_state=WorkflowStateEnum.SUBMITTING,
        expected_attempt_id="att_01",
    )
    assert saved.workflow_state == WorkflowStateEnum.APPLIED
    assert saved.outcome_status == ApplicationOutcomeStatus.SUBMITTED

    # Case B: Stale conditional update with mismatched expected_state -> rowcount is 0 -> ValidationException
    stale_entity = await repo.get_by_id(app_id)
    stale_entity.workflow_state = WorkflowStateEnum.FAILED
    with pytest.raises(ValidationException, match="Application state conflict"):
        await repo.save(
            stale_entity,
            expected_state=WorkflowStateEnum.SUBMITTING,  # Current is APPLIED!
            expected_attempt_id="att_01",
        )

    # Case C: Stale conditional update with mismatched attempt_id -> rowcount is 0 -> ValidationException
    with pytest.raises(ValidationException, match="Application state conflict"):
        await repo.save(
            stale_entity,
            expected_state=WorkflowStateEnum.APPLIED,
            expected_attempt_id="att_WRONG",  # Current is att_01!
        )


# =========================================================================
# TEST 3: Transaction Rollback Integrity
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_transaction_rollback_reverts_uncommitted_changes(db_session: AsyncSession):
    """
    Verify that in SQLite, uncommitted changes inside a failed or rolled back
    transaction are fully discarded and leave existing rows untouched.
    """
    user_id = f"user_rb_{uuid.uuid4().hex[:8]}"
    user = UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="pw", is_active=True)
    db_session.add(user)
    await db_session.commit()

    # Start a transaction that modifies data then rolls back
    try:
        user.full_name = "Modified But Should Rollback"
        # Trigger an integrity error intentionally
        duplicate_user = UserModel(id=f"dup_{user_id}", email=f"{user_id}@test.com", hashed_password="pw")
        db_session.add(duplicate_user)
        await db_session.flush()
    except IntegrityError:
        await db_session.rollback()

    # Verify original user data was restored by rollback
    db_session.expire_all()
    res = await db_session.scalar(select(UserModel).where(UserModel.id == user_id))
    assert res is not None
    assert res.full_name is None  # Reverted!


# =========================================================================
# TEST 4: Unique Constraints Enforcement
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_unique_constraints_prevent_duplicates(db_session: AsyncSession):
    """
    Verify SQLite strictly enforces:
    1. uq_user_job_application on (user_id, job_id).
    2. Unique idempotency_key on applications table.
    """
    user_id = f"user_uq_{uuid.uuid4().hex[:8]}"
    job_id = f"job_uq_{uuid.uuid4().hex[:8]}"

    user = UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="pw", is_active=True)
    job = _make_job(job_id=job_id, external_job_id=f"ext_{user_id}", title="Platform Lead")
    db_session.add_all([user, job])
    await db_session.commit()

    # 1. First application insert
    app1 = ApplicationModel(
        id=f"app1_{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        job_id=job_id,
        idempotency_key=f"idem_{user_id}_1",
        workflow_state="APPROVED",
    )
    db_session.add(app1)
    await db_session.commit()

    # 2. Attempt duplicate (user_id, job_id) -> MUST raise IntegrityError
    app2_duplicate_pair = ApplicationModel(
        id=f"app2_{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        job_id=job_id,
        idempotency_key=f"idem_{user_id}_2",
        workflow_state="APPROVED",
    )
    db_session.add(app2_duplicate_pair)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()

    # 3. Attempt duplicate idempotency_key -> MUST raise IntegrityError
    job2 = _make_job(job_id=f"job2_{uuid.uuid4().hex[:8]}", external_job_id="ext_2", title="Lead 2")
    db_session.add(job2)
    await db_session.commit()

    app3_duplicate_idem = ApplicationModel(
        id=f"app3_{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        job_id=job2.id,
        idempotency_key=f"idem_{user_id}_1",  # Same as app1!
        workflow_state="APPROVED",
    )
    db_session.add(app3_duplicate_idem)
    with pytest.raises(IntegrityError):
        await db_session.flush()
    await db_session.rollback()


# =========================================================================
# TEST 5: Crash Recovery Sweeper under Real SQLite
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_crash_recovery_sweeper_accuracy(db_session: AsyncSession):
    """
    Verify recover_stale_submitting_applications under real SQLite:
    - Stale SUBMITTING applications (older than threshold) are transitioned to RECONCILIATION_REQUIRED.
    - Non-stale SUBMITTING applications are ignored.
    - Non-SUBMITTING applications are ignored.
    - Accurate rowcount count is returned.
    """
    repo = SqlAlchemyApplicationRepository(session=db_session)
    user_id = f"user_sweep_{uuid.uuid4().hex[:8]}"
    user = UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="pw", is_active=True)
    db_session.add(user)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    old_time = now - timedelta(seconds=400)
    fresh_time = now - timedelta(seconds=50)

    # 1. Stale SUBMITTING app
    job1 = _make_job(job_id=f"j1_{uuid.uuid4().hex[:8]}", external_job_id="e1", title="J1")
    db_session.add(job1)
    app_stale = ApplicationModel(
        id=f"app_stale_{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        job_id=job1.id,
        idempotency_key=f"idem_stale_{uuid.uuid4().hex[:6]}",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        updated_at=old_time,
        created_at=old_time,
    )
    db_session.add(app_stale)

    # 2. Fresh SUBMITTING app (not stale yet)
    job2 = _make_job(job_id=f"j2_{uuid.uuid4().hex[:8]}", external_job_id="e2", title="J2")
    db_session.add(job2)
    app_fresh = ApplicationModel(
        id=f"app_fresh_{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        job_id=job2.id,
        idempotency_key=f"idem_fresh_{uuid.uuid4().hex[:6]}",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        updated_at=fresh_time,
        created_at=fresh_time,
    )
    db_session.add(app_fresh)

    # 3. Old APPLIED app (stale age, but NOT SUBMITTING)
    job3 = _make_job(job_id=f"j3_{uuid.uuid4().hex[:8]}", external_job_id="e3", title="J3")
    db_session.add(job3)
    app_applied = ApplicationModel(
        id=f"app_applied_{uuid.uuid4().hex[:8]}",
        user_id=user_id,
        job_id=job3.id,
        idempotency_key=f"idem_applied_{uuid.uuid4().hex[:6]}",
        workflow_state=WorkflowStateEnum.APPLIED.value,
        outcome_status=ApplicationOutcomeStatus.SUBMITTED.value,
        updated_at=old_time,
        created_at=old_time,
    )
    db_session.add(app_applied)
    await db_session.commit()

    # Run sweeper with older_than_seconds=300
    recovered_count = await repo.recover_stale_submitting_applications(older_than_seconds=300)
    assert recovered_count == 1

    # Verify statuses
    r_stale = await repo.get_by_id(app_stale.id)
    assert r_stale.workflow_state == WorkflowStateEnum.RECONCILIATION_REQUIRED
    assert r_stale.outcome_status == ApplicationOutcomeStatus.UNKNOWN

    r_fresh = await repo.get_by_id(app_fresh.id)
    assert r_fresh.workflow_state == WorkflowStateEnum.SUBMITTING

    r_applied = await repo.get_by_id(app_applied.id)
    assert r_applied.workflow_state == WorkflowStateEnum.APPLIED


# =========================================================================
# TEST 6: Concurrent Session Access & Optimistic State Fencing
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_concurrent_session_optimistic_fencing(db_session: AsyncSession):
    """
    Verify concurrent access behavior:
    When two separate AsyncSessions attempt to conditionally transition the same
    application from SUBMITTING, the first succeeds and commits, while the second
    is fenced out by SQLite rowcount check and raises ValidationException.
    """
    bind = db_session.bind
    session_factory = async_sessionmaker(bind=bind, class_=AsyncSession, expire_on_commit=False)

    app_id = f"app_concurrent_{uuid.uuid4().hex[:8]}"
    user_id = f"user_conc_{uuid.uuid4().hex[:8]}"
    job_id = f"job_conc_{uuid.uuid4().hex[:8]}"

    # Setup row in db_session
    user = UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="pw", is_active=True)
    job = _make_job(job_id=job_id, external_job_id=f"ext_{user_id}", title="Staff Eng")
    app_model = ApplicationModel(
        id=app_id,
        user_id=user_id,
        job_id=job_id,
        idempotency_key=f"idem_{app_id}",
        workflow_state=WorkflowStateEnum.SUBMITTING.value,
        outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        current_attempt_id="att_race_100",
    )
    db_session.add_all([user, job, app_model])
    await db_session.commit()

    # Session A: Worker 1
    async with session_factory() as session_a:
        repo_a = SqlAlchemyApplicationRepository(session=session_a)
        app_a = await repo_a.get_by_id(app_id)
        assert app_a.workflow_state == WorkflowStateEnum.SUBMITTING

        # Session B: Recovery Sweeper
        async with session_factory() as session_b:
            repo_b = SqlAlchemyApplicationRepository(session=session_b)
            # Sweeper runs first and updates to RECONCILIATION_REQUIRED
            recovered = await repo_b.recover_stale_submitting_applications(older_than_seconds=-1)
            assert recovered == 1
            await session_b.commit()

        # Now Worker 1 in Session A attempts to conditionally save APPLIED
        app_a.workflow_state = WorkflowStateEnum.APPLIED
        app_a.outcome_status = ApplicationOutcomeStatus.SUBMITTED
        with pytest.raises(ValidationException, match="Application state conflict"):
            await repo_a.save(
                app_a,
                expected_state=WorkflowStateEnum.SUBMITTING,
                expected_attempt_id="att_race_100",
            )


# =========================================================================
# TEST 7: Foreign Key Enforcement & Cascade Deletions in SQLite
# =========================================================================
@pytest.mark.asyncio
async def test_sqlite_foreign_key_and_cascade_constraints(db_session: AsyncSession):
    """
    Verify SQLite foreign key enforcement and cascade deletion behavior:
    1. With PRAGMA foreign_keys=ON, inserting application with non-existent user_id fails.
    2. Deleting parent UserModel cascades and deletes associated ApplicationModel.
    """
    try:
        # Enable foreign keys on connection
        await db_session.execute(text("PRAGMA foreign_keys = ON;"))

        # 1. Invalid foreign key insertion -> IntegrityError
        invalid_app = ApplicationModel(
            id=f"app_fk_fail_{uuid.uuid4().hex[:8]}",
            user_id="non_existent_user_id",
            job_id="non_existent_job_id",
            idempotency_key=f"idem_fk_{uuid.uuid4().hex[:8]}",
            workflow_state="APPROVED",
        )
        db_session.add(invalid_app)
        with pytest.raises(IntegrityError):
            await db_session.flush()
        await db_session.rollback()

        # 2. Valid setup with cascade verification
        await db_session.execute(text("PRAGMA foreign_keys = ON;"))
        user_id = f"user_casc_{uuid.uuid4().hex[:8]}"
        job_id = f"job_casc_{uuid.uuid4().hex[:8]}"
        app_id = f"app_casc_{uuid.uuid4().hex[:8]}"

        # Ensure source exists for FK
        src_check = await db_session.scalar(select(JobSourceModel).where(JobSourceModel.id == "naukri"))
        if not src_check:
            db_session.add(JobSourceModel(id="naukri", source_type="naukri", base_url="https://naukri.com", is_active=True))
            await db_session.flush()

        user = UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="pw", is_active=True)
        job = _make_job(job_id=job_id, external_job_id=f"ext_{user_id}", title="Data Architect")
        app_model = ApplicationModel(
            id=app_id,
            user_id=user_id,
            job_id=job_id,
            idempotency_key=f"idem_casc_{app_id}",
            workflow_state="APPROVED",
        )
        db_session.add_all([user, job, app_model])
        await db_session.commit()

        # Verify rows exist
        app_check = await db_session.scalar(select(ApplicationModel).where(ApplicationModel.id == app_id))
        assert app_check is not None

        # Delete parent user
        user_to_delete = await db_session.scalar(select(UserModel).where(UserModel.id == user_id))
        await db_session.delete(user_to_delete)
        await db_session.commit()

        # Verify child application was deleted by cascade
        app_after_delete = await db_session.scalar(select(ApplicationModel).where(ApplicationModel.id == app_id))
        assert app_after_delete is None
    finally:
        await db_session.execute(text("PRAGMA foreign_keys = OFF;"))
        await db_session.commit()
