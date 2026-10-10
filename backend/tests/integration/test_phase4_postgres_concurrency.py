import asyncio
from datetime import datetime, timezone, timedelta
import os
import pytest
from sqlalchemy import select, or_, and_
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.domain.matching.entities import (
    MatchingTaskStatus,
    MatchResult,
    RecommendationDecision,
)
from app.infrastructure.database.models.models import (
    MatchingTaskModel,
    MatchResultModel,
    JobModel,
    UserModel,
    CandidateProfileModel,
)
from app.infrastructure.database.repositories.matching_repository import (
    SqlAlchemyMatchingTaskRepository,
    SqlAlchemyMatchResultRepository,
)


def test_postgresql_dialect_for_update_skip_locked():
    """
    Scenario 1: Verify PostgreSQL SQL generation constructs
    atomic 'FOR UPDATE SKIP LOCKED' query for worker concurrency.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(MatchingTaskModel)
        .where(
            or_(
                MatchingTaskModel.status == MatchingTaskStatus.QUEUED.value,
                and_(
                    MatchingTaskModel.status == MatchingTaskStatus.LEASED.value,
                    MatchingTaskModel.lease_expires_at < now,
                ),
            )
        )
        .order_by(MatchingTaskModel.created_at.asc())
        .with_for_update(skip_locked=True)
        .limit(1)
    )

    compiled_sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert "FOR UPDATE SKIP LOCKED" in compiled_sql
    assert "matching_tasks" in compiled_sql
    assert "status" in compiled_sql


def test_postgresql_schema_unique_constraints_and_indices():
    """
    Scenario 2: Verify PostgreSQL schema definitions contain the required
    unique constraints and indices for idempotency and concurrency fencing.
    """
    # 1. MatchingTaskModel idempotency constraint
    table = MatchingTaskModel.__table__
    task_constraints = [c.name for c in table.constraints]
    assert "uq_user_job_task_idempotency" in task_constraints

    # 2. MatchResultModel evaluation_key constraint and columns
    match_table = MatchResultModel.__table__
    match_constraints = [c.name for c in match_table.constraints]
    assert "uq_user_job_evaluation_key" in match_constraints

    col_names = [col.name for col in match_table.columns]
    assert "evaluation_key" in col_names
    assert "embedding_model" in col_names
    assert "embedding_version" in col_names


@pytest.mark.asyncio
async def test_concurrent_worker_claiming_mutual_exclusion(db_session: AsyncSession):
    """
    Scenario 3: Concurrent worker task claiming ensures strict mutual exclusion.
    Two workers competing for the same queued task: Worker 1 receives it, Worker 2 gets None.
    """
    repo = SqlAlchemyMatchingTaskRepository(db_session)

    task = await repo.enqueue_task(
        user_id="user_pg_1",
        job_id="job_pg_1",
        task_idempotency_key="idemp_pg_1",
    )
    assert task.status == MatchingTaskStatus.QUEUED
    assert task.lease_version == 1

    # Worker 1 claims task
    w1_task = await repo.claim_next_task(worker_id="pg_worker_1", lease_seconds=120)
    assert w1_task is not None
    assert w1_task.id == task.id
    assert w1_task.worker_id == "pg_worker_1"
    assert w1_task.status == MatchingTaskStatus.LEASED

    # Worker 2 simultaneously queries -> no available task (mutual exclusion)
    w2_task = await repo.claim_next_task(worker_id="pg_worker_2", lease_seconds=120)
    assert w2_task is None


@pytest.mark.asyncio
async def test_expired_lease_automatic_recovery(db_session: AsyncSession):
    """
    Scenario 4: When a worker crashes or abandons a lease (lease_expires_at < now),
    a subsequent worker automatically reclaims the task and increments the lease version.
    """
    repo = SqlAlchemyMatchingTaskRepository(db_session)

    task = await repo.enqueue_task(
        user_id="user_pg_exp",
        job_id="job_pg_exp",
        task_idempotency_key="idemp_pg_exp",
    )

    # Worker 1 leases task with expired duration (-10s)
    w1_task = await repo.claim_next_task(worker_id="dead_worker", lease_seconds=-10)
    assert w1_task is not None

    # Recovery worker reclaims the expired task
    recovery_task = await repo.claim_next_task(worker_id="recovery_worker", lease_seconds=60)
    assert recovery_task is not None
    assert recovery_task.id == task.id
    assert recovery_task.worker_id == "recovery_worker"
    assert recovery_task.lease_version == w1_task.lease_version + 1


@pytest.mark.asyncio
async def test_stale_worker_fencing_protection(db_session: AsyncSession):
    """
    Scenario 5: Stale worker fencing: A worker attempting to complete a task
    with a superseded lease version or invalid worker identity is strictly rejected.
    """
    repo = SqlAlchemyMatchingTaskRepository(db_session)

    task = await repo.enqueue_task(
        user_id="user_fence",
        job_id="job_fence",
        task_idempotency_key="idemp_fence",
    )

    # First claim
    claimed = await repo.claim_next_task(worker_id="worker_active", lease_seconds=60)
    assert claimed is not None

    # Stale attempt: wrong worker ID cannot commit
    unauthorized_res = await repo.complete_task(
        task_id=claimed.id,
        worker_id="worker_impostor",
        lease_version=claimed.lease_version,
    )
    assert unauthorized_res is False

    # Stale attempt: wrong lease version cannot commit
    stale_ver_res = await repo.complete_task(
        task_id=claimed.id,
        worker_id="worker_active",
        lease_version=claimed.lease_version - 1,
    )
    assert stale_ver_res is False

    # Legitimate completion succeeds
    legit_res = await repo.complete_task(
        task_id=claimed.id,
        worker_id="worker_active",
        lease_version=claimed.lease_version,
    )
    assert legit_res is True

    final_task = await repo.get_by_id(claimed.id)
    assert final_task.status == MatchingTaskStatus.COMPLETED


@pytest.mark.asyncio
async def test_idempotent_enqueue_and_evaluation_deduplication(db_session: AsyncSession):
    """
    Scenario 6: Idempotent task enqueueing prevents duplicate queue entries,
    and MatchResult evaluation caching prevents duplicate expensive evaluations.
    """
    task_repo = SqlAlchemyMatchingTaskRepository(db_session)
    match_repo = SqlAlchemyMatchResultRepository(db_session)

    # 1. Enqueue task twice
    t1 = await task_repo.enqueue_task(
        user_id="user_idemp",
        job_id="job_idemp",
        task_idempotency_key="idemp_fixed_key",
    )
    t2 = await task_repo.enqueue_task(
        user_id="user_idemp",
        job_id="job_idemp",
        task_idempotency_key="idemp_fixed_key",
    )
    assert t1.id == t2.id

    # 2. MatchResult persistence and evaluation key caching
    eval_key = "sha256_canonical_eval_key_xyz987"
    match = MatchResult(
        id="match_idemp_1",
        user_id="user_idemp",
        job_id="job_idemp",
        evaluation_key=eval_key,
        match_score=88.5,
        recommendation_score=94.0,
        overall_score=88.5,
        decision=RecommendationDecision.AUTO_APPLY,
        hard_filter_passed=True,
        embedding_model="all-MiniLM-L6-v2",
        embedding_version="2026.1",
    )
    saved = await match_repo.save(match)
    assert saved.evaluation_key == eval_key
    assert saved.embedding_version == "2026.1"

    # Query by evaluation_key
    cached = await match_repo.get_by_evaluation_key(
        user_id="user_idemp",
        job_id="job_idemp",
        evaluation_key=eval_key,
    )
    assert cached is not None
    assert cached.id == saved.id
    assert cached.embedding_version == "2026.1"
