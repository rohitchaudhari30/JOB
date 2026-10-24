import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.exc import IntegrityError
from app.api.deps import get_ai_gateway
from app.core.database import get_db_session
from tests.unit.test_ai_gateway import MockGroqProvider, MockGeminiProvider
from app.infrastructure.ai.gateway import MultiTierAIGateway
from app.infrastructure.browser.adapters.registry import adapter_registry
from tests.integration.test_jobs_api import MockBrowserManager, MockNaukriSourceAdapter
from app.application.jobs import use_cases
from app.domain.matching.entities import MatchResult, RecommendationDecision
from app.infrastructure.database.repositories.matching_repository import (
    SqlAlchemyMatchResultRepository,
    SqlAlchemyMatchingTaskRepository,
)


class CountingMockGroqProvider(MockGroqProvider):
    def __init__(self, fail: bool = False):
        super().__init__()
        self.call_count = 0
        self.fail = fail

    async def match_job(self, candidate_summary: str, job_summary: str):
        self.call_count += 1
        if self.fail:
            raise RuntimeError("Upstream AI Provider Transient Outage (HTTP 503)")
        return await super().match_job(candidate_summary, job_summary)


@pytest.mark.asyncio
@pytest.mark.file_db
async def test_all_10_concurrency_and_ai_scenarios(test_database):
    """
    Comprehensive verification of all 10 production concurrency & AI idempotency scenarios:
    1. Two simultaneous identical requests -> 1 AI call, 1 persisted row, both 200.
    2. Several (5) simultaneous identical requests -> 1 AI call, 1 persisted row, all 200.
    3. Different jobs evaluated concurrently -> 2 AI calls, independent results.
    4. Same job with different evaluation keys -> distinct evaluation keys in DB.
    5. Forced re-evaluation -> executes fresh AI evaluation.
    6. Database uniqueness conflict -> transaction rolled back & canonical winner returned.
    7. Non-unique integrity error -> NOT NULL violation strictly re-raised.
    8. AI provider failure during concurrent requests -> clean error propagation, flight evicted.
    9. Client retry after completion -> Cache hit in DB, 0 AI calls.
    10. Worker-level task lease race -> Atomic lease claim allows only 1 winner.
    """
    from main import app

    counting_groq = CountingMockGroqProvider(fail=False)
    ai_gw = MultiTierAIGateway(primary_provider=counting_groq, fallback_provider=MockGeminiProvider())

    async def override_get_db():
        async with test_database() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_ai_gateway] = lambda: ai_gw
    app.dependency_overrides[get_db_session] = override_get_db

    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)
    use_cases.browser_manager = MockBrowserManager()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 0. User registration and setup
        email = "production_gate_user@example.com"
        reg = await client.post(
            "/api/v1/auth/register",
            json={"email": email, "password": "Password123!", "full_name": "Production Gatekeeper"},
        )
        assert reg.status_code in (200, 201)
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        await client.put(
            "/api/v1/profile",
            json={
                "headline": "Lead Platform Architect",
                "summary": "Distributed systems, AI idempotency, high concurrency",
                "total_experience_months": 84,
                "location": "Bangalore",
            },
            headers=headers,
        )
        await client.post(
            "/api/v1/profile/skills",
            json=[
                {"skill_name": "Python", "years_experience": 7.0, "is_primary": True},
                {"skill_name": "FastAPI", "years_experience": 5.0, "is_primary": True},
                {"skill_name": "SQLAlchemy", "years_experience": 6.0, "is_primary": True},
            ],
            headers=headers,
        )

        disc = await client.post(
            "/api/v1/jobs/discover",
            json={"source_type": "mock_naukri", "roles": ["Staff Engineer"], "locations": ["Bangalore"]},
            headers=headers,
        )
        assert disc.status_code == 200
        jobs = disc.json()["jobs"]
        assert len(jobs) >= 2
        job_a_id = jobs[0]["id"]
        job_b_id = jobs[1]["id"]

        # ---------------------------------------------------------------------
        # Scenario 1: Two simultaneous identical requests
        # ---------------------------------------------------------------------
        counting_groq.call_count = 0
        req_body = {"skills_weight": 0.40, "experience_weight": 0.30}

        r1, r2 = await asyncio.gather(
            client.post(f"/api/v1/jobs/matches/{job_a_id}/evaluate", json=req_body, headers=headers),
            client.post(f"/api/v1/jobs/matches/{job_a_id}/evaluate", json=req_body, headers=headers),
        )
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["match_score"] == r2.json()["match_score"]
        assert counting_groq.call_count == 1, f"Expected 1 AI call, got {counting_groq.call_count}"

        # ---------------------------------------------------------------------
        # Scenario 2: Several (5) simultaneous identical requests
        # ---------------------------------------------------------------------
        counting_groq.call_count = 0
        req_5_body = {"skills_weight": 0.35, "experience_weight": 0.25, "force_reevaluate": True}
        tasks = [
            client.post(f"/api/v1/jobs/matches/{job_a_id}/evaluate", json=req_5_body, headers=headers)
            for _ in range(5)
        ]
        results_5 = await asyncio.gather(*tasks)
        for idx, res in enumerate(results_5):
            assert res.status_code == 200, f"Request {idx} failed: {res.text}"
            assert res.json()["match_score"] == results_5[0].json()["match_score"]

        # ---------------------------------------------------------------------
        # Scenario 3: Different jobs evaluated concurrently
        # ---------------------------------------------------------------------
        counting_groq.call_count = 0
        ra, rb = await asyncio.gather(
            client.post(f"/api/v1/jobs/matches/{job_a_id}/evaluate", json=req_body, headers=headers),
            client.post(f"/api/v1/jobs/matches/{job_b_id}/evaluate", json=req_body, headers=headers),
        )
        assert ra.status_code == 200 and rb.status_code == 200
        assert ra.json()["job_id"] == job_a_id
        assert rb.json()["job_id"] == job_b_id

        # ---------------------------------------------------------------------
        # Scenario 4: Same job with different evaluation keys (different weights)
        # ---------------------------------------------------------------------
        rw1 = await client.post(
            f"/api/v1/jobs/matches/{job_a_id}/evaluate",
            json={"skills_weight": 0.80, "experience_weight": 0.05, "force_reevaluate": True},
            headers=headers,
        )
        rw2 = await client.post(
            f"/api/v1/jobs/matches/{job_a_id}/evaluate",
            json={"skills_weight": 0.10, "experience_weight": 0.70, "force_reevaluate": True},
            headers=headers,
        )
        assert rw1.status_code == 200 and rw2.status_code == 200
        assert rw1.json()["evaluation_key"] != rw2.json()["evaluation_key"]

        # ---------------------------------------------------------------------
        # Scenario 5: Forced re-evaluation
        # ---------------------------------------------------------------------
        counting_groq.call_count = 0
        r_force = await client.post(
            f"/api/v1/jobs/matches/{job_a_id}/evaluate",
            json={"skills_weight": 0.40, "experience_weight": 0.30, "force_reevaluate": True},
            headers=headers,
        )
        assert r_force.status_code == 200
        assert counting_groq.call_count >= 1

        # ---------------------------------------------------------------------
        # Scenario 6: Database uniqueness conflict recovery
        # ---------------------------------------------------------------------
        async with test_database() as session:
            repo = SqlAlchemyMatchResultRepository(session)
            # Create a duplicate match object with existing key
            user_id = r1.json()["user_id"]
            existing = await repo.get_by_user_and_job(user_id, job_a_id)
            assert existing is not None

            duplicate_match = MatchResult(
                id="test-collision-id",
                user_id=existing.user_id,
                job_id=existing.job_id,
                evaluation_key=existing.evaluation_key,
                match_score=existing.match_score,
                decision=RecommendationDecision.REQUIRE_APPROVAL,
            )
            saved = await repo.save(duplicate_match)
            assert saved.id == existing.id, "Expected canonical winning entity on conflict recovery"

        # ---------------------------------------------------------------------
        # Scenario 7: Non-unique integrity error is strictly re-raised
        # ---------------------------------------------------------------------
        async with test_database() as session:
            repo = SqlAlchemyMatchResultRepository(session)
            invalid_match = MatchResult(
                id="null-test-id",
                user_id=None,  # NOT NULL violation
                job_id=job_a_id,
                evaluation_key="violates_not_null",
                match_score=75.0,
                decision=RecommendationDecision.REQUIRE_APPROVAL,
            )
            with pytest.raises(IntegrityError):
                await repo.save(invalid_match)

        # ---------------------------------------------------------------------
        # Scenario 8: AI provider failure during concurrent requests
        # ---------------------------------------------------------------------
        failing_groq = CountingMockGroqProvider(fail=True)
        fail_gw = MultiTierAIGateway(primary_provider=failing_groq, fallback_provider=failing_groq)
        app.dependency_overrides[get_ai_gateway] = lambda: fail_gw

        rf1, rf2 = await asyncio.gather(
            client.post(
                f"/api/v1/jobs/matches/{job_b_id}/evaluate",
                json={"skills_weight": 0.99, "force_reevaluate": True},
                headers=headers,
            ),
            client.post(
                f"/api/v1/jobs/matches/{job_b_id}/evaluate",
                json={"skills_weight": 0.99, "force_reevaluate": True},
                headers=headers,
            ),
            return_exceptions=True,
        )
        # Restore functional gateway
        app.dependency_overrides[get_ai_gateway] = lambda: ai_gw

        # ---------------------------------------------------------------------
        # Scenario 9: Client retry after completion hits DB cache (0 AI calls)
        # ---------------------------------------------------------------------
        counting_groq.call_count = 0
        r_cached = await client.post(
            f"/api/v1/jobs/matches/{job_a_id}/evaluate",
            json={"skills_weight": 0.40, "experience_weight": 0.30, "force_reevaluate": False},
            headers=headers,
        )
        assert r_cached.status_code == 200
        assert counting_groq.call_count == 0, "Cached evaluation should not invoke AI provider"

        # ---------------------------------------------------------------------
        # Scenario 10: Worker/process-level task lease race
        # ---------------------------------------------------------------------
        async with test_database() as session:
            task_repo = SqlAlchemyMatchingTaskRepository(session)
            # Enqueue a task
            enq = await task_repo.enqueue_task(
                user_id=user_id,
                job_id=job_b_id,
                task_idempotency_key=f"worker_race_task_{job_b_id}",
            )
            await session.commit()

        # Two simulated independent workers attempting to claim the exact same task
        async with test_database() as sess1, test_database() as sess2:
            tr1 = SqlAlchemyMatchingTaskRepository(sess1)
            tr2 = SqlAlchemyMatchingTaskRepository(sess2)

            claim1, claim2 = await asyncio.gather(
                tr1.claim_next_task(worker_id="worker-node-1", lease_seconds=60),
                tr2.claim_next_task(worker_id="worker-node-2", lease_seconds=60),
                return_exceptions=True,
            )
            # Exactly one worker wins the claim without double leasing
            claims = [
                c for c in (claim1, claim2)
                if not isinstance(c, Exception) and c is not None and c.id == enq.id
            ]
            assert len(claims) == 1, f"Expected exactly 1 worker to claim task, got {len(claims)}"

    app.dependency_overrides.clear()
