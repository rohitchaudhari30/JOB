from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token
from app.domain.matching.entities import (
    MatchingTaskStatus,
    MatchResult,
    RecommendationDecision,
)
from app.infrastructure.database.models.models import (
    JobModel,
    MatchResultModel,
    MatchingTaskModel,
    UserModel,
    CandidateProfileModel,
)
from app.infrastructure.database.repositories.matching_repository import (
    SqlAlchemyMatchingTaskRepository,
    SqlAlchemyMatchResultRepository,
)


@pytest.mark.asyncio
async def test_matching_task_queue_claim_and_mutual_exclusion(db_session: AsyncSession):
    repo = SqlAlchemyMatchingTaskRepository(db_session)

    # 1. Enqueue task
    task = await repo.enqueue_task(
        user_id="user_conc_1",
        job_id="job_conc_1",
        task_idempotency_key="idemp_key_1",
    )
    assert task.status == MatchingTaskStatus.QUEUED
    assert task.lease_version == 1

    # Idempotent re-enqueue returns existing queued task
    task_dup = await repo.enqueue_task(
        user_id="user_conc_1",
        job_id="job_conc_1",
        task_idempotency_key="idemp_key_1",
    )
    assert task_dup.id == task.id

    # 2. Worker 1 claims task
    claimed_w1 = await repo.claim_next_task(worker_id="worker_alpha", lease_seconds=60)
    assert claimed_w1 is not None
    assert claimed_w1.id == task.id
    assert claimed_w1.status == MatchingTaskStatus.LEASED
    assert claimed_w1.worker_id == "worker_alpha"
    assert claimed_w1.lease_version == 2
    assert claimed_w1.lease_expires_at is not None

    # 3. Worker 2 tries to claim next task -> None (mutual exclusion)
    claimed_w2 = await repo.claim_next_task(worker_id="worker_beta", lease_seconds=60)
    assert claimed_w2 is None

    # 4. Stale lease write protection: worker_beta cannot complete worker_alpha's task
    stale_completed = await repo.complete_task(
        task_id=claimed_w1.id,
        worker_id="worker_beta",
        lease_version=claimed_w1.lease_version,
    )
    assert stale_completed is False

    # 5. Wrong lease version cannot complete
    wrong_ver_completed = await repo.complete_task(
        task_id=claimed_w1.id,
        worker_id="worker_alpha",
        lease_version=99,
    )
    assert wrong_ver_completed is False

    # 6. Correct worker with correct lease version completes
    ok_completed = await repo.complete_task(
        task_id=claimed_w1.id,
        worker_id="worker_alpha",
        lease_version=claimed_w1.lease_version,
    )
    assert ok_completed is True

    final_task = await repo.get_by_id(claimed_w1.id)
    assert final_task.status == MatchingTaskStatus.COMPLETED


@pytest.mark.asyncio
async def test_matching_task_lease_expiration_reclaim(db_session: AsyncSession):
    repo = SqlAlchemyMatchingTaskRepository(db_session)

    # Enqueue task
    task = await repo.enqueue_task(
        user_id="user_exp_1",
        job_id="job_exp_1",
        task_idempotency_key="idemp_exp_1",
    )

    # Worker 1 claims with expired lease (-10 seconds)
    claimed_w1 = await repo.claim_next_task(worker_id="worker_dead", lease_seconds=-10)
    assert claimed_w1 is not None

    # Worker 2 should now be able to reclaim the expired task
    claimed_w2 = await repo.claim_next_task(worker_id="worker_recovery", lease_seconds=120)
    assert claimed_w2 is not None
    assert claimed_w2.id == task.id
    assert claimed_w2.worker_id == "worker_recovery"
    assert claimed_w2.lease_version == claimed_w1.lease_version + 1


@pytest.mark.asyncio
async def test_match_result_caching_and_evaluation_key(db_session: AsyncSession):
    match_repo = SqlAlchemyMatchResultRepository(db_session)

    match = MatchResult(
        id="match_test_key_1",
        user_id="user_cached",
        job_id="job_cached",
        evaluation_key="sha256_immutable_eval_key_abc123",
        match_score=85.0,
        recommendation_score=92.0,
        overall_score=85.0,
        decision=RecommendationDecision.AUTO_APPLY,
        hard_filter_passed=True,
    )

    saved = await match_repo.save(match)
    assert saved.evaluation_key == "sha256_immutable_eval_key_abc123"
    assert saved.match_score == 85.0
    assert saved.recommendation_score == 92.0
    assert saved.overall_score == 85.0  # Backward compatibility guaranteed

    # Retrieve by evaluation_key
    cached = await match_repo.get_by_evaluation_key(
        user_id="user_cached",
        job_id="job_cached",
        evaluation_key="sha256_immutable_eval_key_abc123",
    )
    assert cached is not None
    assert cached.id == saved.id
    assert cached.match_score == 85.0


@pytest.mark.asyncio
async def test_matching_api_endpoints(client: AsyncClient, db_session: AsyncSession):
    # Setup test user and profile
    user = UserModel(
        id="user_phase4_api",
        email="phase4@autoapply.ai",
        hashed_password="fakehash",
        is_active=True,
    )
    db_session.add(user)

    profile = CandidateProfileModel(
        id="prof_phase4_api",
        user_id="user_phase4_api",
        headline="Senior Python Engineer",
        total_experience_months=48,
    )
    db_session.add(profile)

    job = JobModel(
        id="job_phase4_api",
        source_id="naukri",
        external_job_id="ext_phase4_api",
        title="Senior Python Engineer",
        company="Stripe",
        location="Bangalore",
        min_experience_years=3.0,
        max_experience_years=6.0,
        raw_description="Looking for Senior Python Engineer with distributed systems expertise.",
        apply_url="https://stripe.com/jobs/123",
        is_active=True,
    )
    db_session.add(job)
    await db_session.commit()

    token = create_access_token({"sub": "user_phase4_api"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Single evaluation
    eval_resp = await client.post(
        f"/api/v1/jobs/matches/{job.id}/evaluate",
        headers=headers,
        json={"skills_weight": 0.40, "experience_weight": 0.30},
    )
    assert eval_resp.status_code == 200
    data = eval_resp.json()
    assert "match_score" in data
    assert "recommendation_score" in data
    assert "overall_score" in data
    assert data["overall_score"] == data["match_score"]  # Backward compatibility
    assert data["job_title"] == "Senior Python Engineer"

    # 2. List matches
    list_resp = await client.get("/api/v1/jobs/matches", headers=headers)
    assert list_resp.status_code == 200
    matches = list_resp.json()
    assert len(matches) >= 1
    assert matches[0]["overall_score"] == matches[0]["match_score"]

    # 3. Batch enqueue
    enqueue_resp = await client.post("/api/v1/jobs/matches/batch-enqueue?limit=10", headers=headers)
    assert enqueue_resp.status_code == 202
    assert enqueue_resp.json()["status"] == "queued"

    # 4. Tasks count
    count_resp = await client.get("/api/v1/jobs/matches/tasks/count", headers=headers)
    assert count_resp.status_code == 200
    assert "pending_tasks" in count_resp.json()
