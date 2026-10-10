import pytest
from httpx import AsyncClient
from datetime import datetime, timezone, timedelta


from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_dashboard_and_analytics_phase1_flow(client: AsyncClient, db_session: AsyncSession):
    # 1. Register User A
    user_a_payload = {
        "email": "candidate_a@example.com",
        "password": "Password123!",
        "full_name": "Candidate Alpha",
    }
    reg_a = await client.post("/api/v1/auth/register", json=user_a_payload)
    assert reg_a.status_code == 201
    token_a = reg_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 2. Register User B (for user isolation verification)
    user_b_payload = {
        "email": "candidate_b@example.com",
        "password": "Password123!",
        "full_name": "Candidate Beta",
    }
    reg_b = await client.post("/api/v1/auth/register", json=user_b_payload)
    assert reg_b.status_code == 201
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 3. User A checks initial Dashboard Overview
    # With no campaigns yet: MIN(Account Safe Ceiling 50, Platform Cap 30) = 30
    dash_a = await client.get("/api/v1/dashboard/overview", headers=headers_a)
    assert dash_a.status_code == 200
    data_a = dash_a.json()
    assert data_a["today_applied_count"] == 0
    assert data_a["effective_daily_limit"] == 30
    assert data_a["quota_remaining"] == 30
    assert data_a["quota_percentage"] == 0.0
    assert data_a["active_run"]["is_running"] is False
    assert len(data_a["readiness"]) == 4

    # 4. Create a Campaign for User A with custom safety limit = 15
    camp_payload = {
        "name": "Frontend Senior Roles",
        "rule": {
            "auto_apply_threshold": 80.0,
            "review_threshold": 65.0,
            "target_roles": ["Frontend Engineer"],
            "target_locations": ["Remote"],
        },
        "safety_policy": {
            "daily_application_limit": 15,
            "hourly_application_limit": 3,
        },
    }
    camp_res = await client.post("/api/v1/campaigns", json=camp_payload, headers=headers_a)
    assert camp_res.status_code == 201

    # Verify Dashboard updates effective_daily_limit dynamically:
    # MIN(Campaign Safety Limit 15, Platform Cap 30, Account Ceiling 50) = 15
    dash_a_updated = await client.get("/api/v1/dashboard/overview", headers=headers_a)
    assert dash_a_updated.status_code == 200
    assert dash_a_updated.json()["effective_daily_limit"] == 15
    assert dash_a_updated.json()["quota_remaining"] == 15

    # User B should still see their default limit 30 (User isolation on daily limit)
    dash_b = await client.get("/api/v1/dashboard/overview", headers=headers_b)
    assert dash_b.status_code == 200
    assert dash_b.json()["effective_daily_limit"] == 30

    # 5. Timezone-Aware Today Boundary Check
    dash_tz = await client.get("/api/v1/dashboard/overview?client_tz=Asia/Kolkata", headers=headers_a)
    assert dash_tz.status_code == 200
    assert dash_tz.json()["effective_daily_limit"] == 15

    # 6. Setup candidate profile for User A
    await client.put(
        "/api/v1/profile",
        json={
            "headline": "Senior Frontend Engineer",
            "summary": "Specialized in React, TypeScript, and modern UI architectures",
            "total_experience_months": 48,
            "location": "Remote",
        },
        headers=headers_a,
    )
    await client.post(
        "/api/v1/profile/skills",
        json=[
            {"skill_name": "React", "years_experience": 4.0, "is_primary": True},
            {"skill_name": "TypeScript", "years_experience": 3.0, "is_primary": True},
        ],
        headers=headers_a,
    )

    # 7. User Scoping in Analytics Funnel:
    # Discover a job and evaluate match for User A only
    from app.infrastructure.browser.adapters.registry import adapter_registry
    from tests.integration.test_jobs_api import MockBrowserManager, MockNaukriSourceAdapter
    from app.application.jobs import use_cases

    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)
    use_cases.browser_manager = MockBrowserManager()

    disc_res = await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_naukri", "roles": ["Frontend Engineer"], "locations": ["Remote"]},
        headers=headers_a,
    )
    assert disc_res.status_code == 200
    jobs = disc_res.json()["jobs"]
    assert len(jobs) >= 1
    job_id = jobs[0]["id"]

    # Evaluate match for User A
    from app.api.deps import get_ai_gateway
    from tests.unit.test_ai_gateway import MockGroqProvider, MockGeminiProvider
    from app.infrastructure.ai.gateway import MultiTierAIGateway
    from main import app

    app.dependency_overrides[get_ai_gateway] = lambda: MultiTierAIGateway(
        primary_provider=MockGroqProvider(), fallback_provider=MockGeminiProvider()
    )

    eval_res = await client.post(
        f"/api/v1/jobs/matches/{job_id}/evaluate",
        json={"skills_weight": 0.40, "experience_weight": 0.30},
        headers=headers_a,
    )
    assert eval_res.status_code == 200

    # User A's funnel should show 1 discovered, 1 matched
    funnel_a = await client.get("/api/v1/analytics/funnel", headers=headers_a)
    assert funnel_a.status_code == 200
    assert funnel_a.json()["total_discovered"] == 1
    assert funnel_a.json()["total_matched"] == 1

    # User B's funnel MUST show 0 discovered, 0 matched (Zero leakage from global jobs table!)
    funnel_b = await client.get("/api/v1/analytics/funnel", headers=headers_b)
    assert funnel_b.status_code == 200
    assert funnel_b.json()["total_discovered"] == 0
    assert funnel_b.json()["total_matched"] == 0

    # 8. Test Date-Bounding filters on Analytics
    now = datetime.now(timezone.utc)
    future_start = (now + timedelta(days=2)).isoformat()
    future_end = (now + timedelta(days=5)).isoformat()

    filtered_funnel = await client.get(
        "/api/v1/analytics/funnel",
        params={"start_date": future_start, "end_date": future_end},
        headers=headers_a,
    )
    assert filtered_funnel.status_code == 200
    assert filtered_funnel.json()["total_discovered"] == 0
    assert filtered_funnel.json()["total_matched"] == 0

    # 9. Test Campaign Performance Endpoint
    camp_perf_res = await client.get("/api/v1/analytics/campaigns", headers=headers_a)
    assert camp_perf_res.status_code == 200
    camp_perf_data = camp_perf_res.json()
    assert len(camp_perf_data) == 1
    assert camp_perf_data[0]["campaign_name"] == "Frontend Senior Roles"

    # 10. Verify Unsubmitted Application has outcome_status = NOT_SUBMITTED
    create_app_res = await client.post(
        "/api/v1/applications",
        json={"job_id": job_id},
        headers=headers_a,
    )
    assert create_app_res.status_code == 201
    app_entity_id = create_app_res.json()["id"]

    # Fetch app detail from repository directly to inspect outcome_status
    from app.infrastructure.database.models import ApplicationModel
    from sqlalchemy import select
    app_model = await db_session.scalar(select(ApplicationModel).where(ApplicationModel.id == app_entity_id))
    assert app_model is not None
    assert app_model.outcome_status == "NOT_SUBMITTED"

    # 11. Verify Discovered Job without AI Matching is counted via Campaign Job Item
    # Insert a campaign job item for User A's campaign execution without matching
    from app.infrastructure.database.models import CampaignExecutionModel, CampaignJobItemModel
    import uuid
    from app.infrastructure.database.models import UserModel
    user_a_db = await db_session.scalar(select(UserModel).where(UserModel.email == "candidate_a@example.com"))
    exec_model = CampaignExecutionModel(
        id=f"exec_{uuid.uuid4().hex[:12]}",
        campaign_id=camp_perf_data[0]["campaign_id"],
        user_id=user_a_db.id,
        status="RUNNING",
    )
    db_session.add(exec_model)

    unmatched_job_item = CampaignJobItemModel(
        id=f"item_{uuid.uuid4().hex[:12]}",
        execution_id=exec_model.id,
        job_id="job_mock_2",  # From mock adapter, discovered without match
        match_score=0.0,
        decision="PENDING",
        queue_status="PENDING",
    )
    db_session.add(unmatched_job_item)
    await db_session.commit()

    # User A's funnel should now count the unmatched discovered job!
    funnel_a_with_unmatched = await client.get("/api/v1/analytics/funnel", headers=headers_a)
    assert funnel_a_with_unmatched.status_code == 200
    assert funnel_a_with_unmatched.json()["total_discovered"] == 2

