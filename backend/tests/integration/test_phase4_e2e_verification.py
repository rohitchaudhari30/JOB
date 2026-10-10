import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.domain.applications.entities import ApplicationOutcomeStatus, WorkflowStateEnum
from app.infrastructure.database.models import (
    ApplicationModel,
    ApplicationEventModel,
    JobModel,
    JobSourceModel,
    MatchResultModel,
    CampaignModel,
    CampaignExecutionModel,
    CampaignJobItemModel,
    UserModel,
)
from app.infrastructure.browser.adapters.registry import adapter_registry
from tests.integration.test_jobs_api import MockBrowserManager, MockNaukriSourceAdapter
from app.application.jobs import use_cases
from app.api.deps import get_ai_gateway
from tests.unit.test_ai_gateway import MockGroqProvider, MockGeminiProvider
from app.infrastructure.ai.gateway import MultiTierAIGateway
from main import app


@pytest.mark.asyncio
async def test_phase4_end_to_end_verification_suite(client: AsyncClient, db_session: AsyncSession):
    """
    Phase 4 End-to-End System Integration & Workflow Verification Suite:
    - Check A: Application Lifecycle (Discovered -> Matched -> Triggered -> Submitted)
    - Check B: Employer Response Lifecycle (Responded -> Interviewing -> Offered) + Rate Accuracy
    - Check C: Campaign Analytics Parity with Funnel
    - Check D: Tenant & Platform Multi-User Isolation (User A vs User B on Naukri)
    - Check E: Date Range Filtering & Timezone Boundaries
    - Check F: Read-Only Surface Audit (Zero Mutations Allowed on Analytics Routes)
    """

    # Setup AI Gateway mock
    app.dependency_overrides[get_ai_gateway] = lambda: MultiTierAIGateway(
        primary_provider=MockGroqProvider(), fallback_provider=MockGeminiProvider()
    )
    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)
    use_cases.browser_manager = MockBrowserManager()

    # -------------------------------------------------------------------------
    # 1. Tenant Setup: User A & User B
    # -------------------------------------------------------------------------
    user_a_email = f"user_a_{uuid.uuid4().hex[:6]}@example.com"
    reg_a = await client.post(
        "/api/v1/auth/register",
        json={"email": user_a_email, "password": "Password123!", "full_name": "Candidate Alpha"},
    )
    assert reg_a.status_code == 201
    token_a = reg_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    user_b_email = f"user_b_{uuid.uuid4().hex[:6]}@example.com"
    reg_b = await client.post(
        "/api/v1/auth/register",
        json={"email": user_b_email, "password": "Password123!", "full_name": "Candidate Beta"},
    )
    assert reg_b.status_code == 201
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    user_a_db = await db_session.scalar(select(UserModel).where(UserModel.email == user_a_email))
    user_b_db = await db_session.scalar(select(UserModel).where(UserModel.email == user_b_email))
    assert user_a_db is not None
    assert user_b_db is not None

    # Setup Source
    existing_source = await db_session.scalar(select(JobSourceModel).where(JobSourceModel.source_type == "naukri"))
    if not existing_source:
        existing_source = JobSourceModel(
            id=f"src_naukri_{uuid.uuid4().hex[:6]}",
            source_type="naukri",
            base_url="https://www.naukri.com",
            is_active=True,
        )
        db_session.add(existing_source)
        await db_session.commit()
    source_model = existing_source

    # -------------------------------------------------------------------------
    # CHECK A: Application Lifecycle
    # Discovered -> AI Matched -> Application Triggered -> Verified Submission
    # -------------------------------------------------------------------------
    now = datetime.now(timezone.utc)
    job_1 = JobModel(
        id=f"job_e2e_1_{uuid.uuid4().hex[:6]}",
        source_id=source_model.id,
        external_job_id=f"ext_1_{uuid.uuid4().hex[:6]}",
        title="Senior Full-Stack Engineer",
        company="TechCorp Alpha",
        location="Remote",
        apply_url="https://naukri.com/job/1",
        raw_description="Python, FastAPI, React",
    )
    db_session.add(job_1)
    await db_session.commit()

    # User A matches job_1
    match_1 = MatchResultModel(
        id=f"match_{uuid.uuid4().hex[:6]}",
        user_id=user_a_db.id,
        job_id=job_1.id,
        overall_score=88.0,
        skill_match_score=90.0,
        semantic_score=85.0,
        decision="AUTO_APPLY",
    )
    db_session.add(match_1)
    await db_session.commit()

    # User A creates application (Triggered stage)
    app_1 = ApplicationModel(
        id=f"app_e2e_1_{uuid.uuid4().hex[:6]}",
        user_id=user_a_db.id,
        job_id=job_1.id,
        idempotency_key=f"idem_1_{uuid.uuid4().hex[:8]}",
        workflow_state="SUBMITTING",
        outcome_status="NOT_SUBMITTED",
        created_at=now,
    )
    db_session.add(app_1)
    await db_session.commit()

    # Funnel before submission: Triggered = 1, Submitted = 0
    funnel_res_1 = await client.get("/api/v1/analytics/funnel", headers=headers_a)
    assert funnel_res_1.status_code == 200
    f1 = funnel_res_1.json()
    assert f1["total_discovered"] == 1
    assert f1["total_matched"] == 1
    assert f1["total_triggered"] == 1
    assert f1["total_submitted"] == 0

    # Simulate submission completion (Playwright successfully finishes form)
    app_1.workflow_state = WorkflowStateEnum.APPLIED.value
    app_1.outcome_status = ApplicationOutcomeStatus.SUBMITTED.value
    app_1.applied_at = now
    
    # Emit verified APPLICATION_SUBMITTED event
    submission_event = ApplicationEventModel(
        id=f"evt_{uuid.uuid4().hex[:8]}",
        application_id=app_1.id,
        event_name="APPLICATION_SUBMITTED",
        payload={"outcome_status": "SUBMITTED"},
        created_at=now,
    )
    db_session.add(submission_event)
    await db_session.commit()

    # Verify Funnel after submission: Submitted +1
    funnel_res_2 = await client.get("/api/v1/analytics/funnel", headers=headers_a)
    assert funnel_res_2.status_code == 200
    f2 = funnel_res_2.json()
    assert f2["total_discovered"] == 1
    assert f2["total_matched"] == 1
    assert f2["total_triggered"] == 1
    assert f2["total_submitted"] == 1
    assert f2["submission_rate_pct"] == 100.0

    # -------------------------------------------------------------------------
    # CHECK B: Employer Response Lifecycle & Rates
    # SUBMITTED -> RESPONDED -> INTERVIEWING -> OFFERED
    # -------------------------------------------------------------------------
    # Step 1: Employer responds
    app_1.outcome_status = ApplicationOutcomeStatus.RESPONDED.value
    resp_event = ApplicationEventModel(
        id=f"evt_{uuid.uuid4().hex[:8]}",
        application_id=app_1.id,
        event_name="OUTCOME_RESPONDED",
        created_at=now,
    )
    db_session.add(resp_event)
    await db_session.commit()

    funnel_resp = (await client.get("/api/v1/analytics/funnel", headers=headers_a)).json()
    assert funnel_resp["total_responded"] == 1
    assert funnel_resp["response_rate_pct"] == 100.0
    assert funnel_resp["total_interviewed"] == 0
    assert funnel_resp["interview_rate_pct"] == 0.0

    # Step 2: Recruiter schedules Interview
    app_1.outcome_status = ApplicationOutcomeStatus.INTERVIEWING.value
    int_event = ApplicationEventModel(
        id=f"evt_{uuid.uuid4().hex[:8]}",
        application_id=app_1.id,
        event_name="OUTCOME_INTERVIEWING",
        created_at=now,
    )
    db_session.add(int_event)
    await db_session.commit()

    funnel_int = (await client.get("/api/v1/analytics/funnel", headers=headers_a)).json()
    assert funnel_int["total_responded"] == 1
    assert funnel_int["total_interviewed"] == 1
    assert funnel_int["interview_rate_pct"] == 100.0
    assert funnel_int["total_offered"] == 0
    assert funnel_int["offer_rate_pct"] == 0.0

    # Step 3: Candidate receives formal Offer
    app_1.outcome_status = ApplicationOutcomeStatus.OFFERED.value
    offer_event = ApplicationEventModel(
        id=f"evt_{uuid.uuid4().hex[:8]}",
        application_id=app_1.id,
        event_name="OUTCOME_OFFERED",
        created_at=now,
    )
    db_session.add(offer_event)
    await db_session.commit()

    funnel_off = (await client.get("/api/v1/analytics/funnel", headers=headers_a)).json()
    assert funnel_off["total_responded"] == 1
    assert funnel_off["total_interviewed"] == 1
    assert funnel_off["total_offered"] == 1
    assert funnel_off["response_rate_pct"] == 100.0
    assert funnel_off["interview_rate_pct"] == 100.0
    assert funnel_off["offer_rate_pct"] == 100.0

    # -------------------------------------------------------------------------
    # CHECK C: Campaign Analytics Parity
    # -------------------------------------------------------------------------
    camp_model = CampaignModel(
        id=f"camp_{uuid.uuid4().hex[:6]}",
        user_id=user_a_db.id,
        name="Targeted Full-Stack Campaign",
        state="RUNNING",
    )
    db_session.add(camp_model)
    await db_session.commit()

    exec_model = CampaignExecutionModel(
        id=f"exec_{uuid.uuid4().hex[:6]}",
        campaign_id=camp_model.id,
        user_id=user_a_db.id,
        status="RUNNING",
    )
    db_session.add(exec_model)
    await db_session.commit()

    camp_item = CampaignJobItemModel(
        id=f"citem_{uuid.uuid4().hex[:6]}",
        execution_id=exec_model.id,
        job_id=job_1.id,
        match_score=88.0,
        decision="AUTO_APPLY",
        queue_status="COMPLETED",
        processed_at=now,
    )
    db_session.add(camp_item)
    await db_session.commit()

    camp_perf_res = await client.get("/api/v1/analytics/campaigns", headers=headers_a)
    assert camp_perf_res.status_code == 200
    camp_perf = camp_perf_res.json()
    assert len(camp_perf) >= 1
    camp_item_data = [c for c in camp_perf if c["campaign_id"] == camp_model.id][0]
    assert camp_item_data["discovered_count"] >= 1
    assert camp_item_data["matched_count"] >= 1
    assert camp_item_data["submitted_count"] >= 1
    assert camp_item_data["response_count"] >= 1
    assert camp_item_data["interview_count"] >= 1
    assert camp_item_data["offer_count"] >= 1
    assert camp_item_data["response_rate_pct"] == 100.0
    assert camp_item_data["interview_rate_pct"] == 100.0
    assert camp_item_data["offer_rate_pct"] == 100.0

    # -------------------------------------------------------------------------
    # CHECK D: Tenant & Platform Multi-User Isolation
    # User A has 1 application on Naukri. User B has 0 applications on Naukri.
    # -------------------------------------------------------------------------
    # Create job_2 and application for User B on Naukri
    job_2 = JobModel(
        id=f"job_e2e_2_{uuid.uuid4().hex[:6]}",
        source_id=source_model.id,
        external_job_id=f"ext_2_{uuid.uuid4().hex[:6]}",
        title="Backend Python Developer",
        company="Beta Works",
        location="Remote",
        apply_url="https://naukri.com/job/2",
        raw_description="Python, PostgreSQL",
    )
    db_session.add(job_2)
    await db_session.commit()

    app_b = ApplicationModel(
        id=f"app_e2e_b_{uuid.uuid4().hex[:6]}",
        user_id=user_b_db.id,
        job_id=job_2.id,
        idempotency_key=f"idem_b_{uuid.uuid4().hex[:8]}",
        workflow_state="APPLIED",
        outcome_status="SUBMITTED",
        applied_at=now,
        created_at=now,
    )
    db_session.add(app_b)
    await db_session.commit()

    # User A checks platform performance
    src_res_a = await client.get("/api/v1/analytics/sources", headers=headers_a)
    assert src_res_a.status_code == 200
    sources_a = src_res_a.json()
    naukri_a = [s for s in sources_a if s["source_type"] == "naukri"][0]
    # User A must ONLY see their 1 application, NOT User B's application!
    assert naukri_a["submitted_count"] == 1
    assert naukri_a["offer_count"] == 1

    # User B checks platform performance
    src_res_b = await client.get("/api/v1/analytics/sources", headers=headers_b)
    assert src_res_b.status_code == 200
    sources_b = src_res_b.json()
    naukri_b = [s for s in sources_b if s["source_type"] == "naukri"][0]
    # User B must ONLY see their 1 application, NOT User A's!
    assert naukri_b["submitted_count"] == 1
    assert naukri_b["offer_count"] == 0  # User B has not received offer

    # -------------------------------------------------------------------------
    # CHECK E: Date Range Presets & Timezone Filtering
    # -------------------------------------------------------------------------
    # Past job & application (15 days ago) for User A
    past_date = now - timedelta(days=15)
    job_past = JobModel(
        id=f"job_past_{uuid.uuid4().hex[:6]}",
        source_id=source_model.id,
        external_job_id=f"ext_past_{uuid.uuid4().hex[:6]}",
        title="Old Historical Job",
        company="OldCo",
        location="Remote",
        apply_url="https://naukri.com/old",
        raw_description="Legacy stack",
    )
    db_session.add(job_past)
    await db_session.commit()

    app_past = ApplicationModel(
        id=f"app_past_{uuid.uuid4().hex[:6]}",
        user_id=user_a_db.id,
        job_id=job_past.id,
        idempotency_key=f"idem_past_{uuid.uuid4().hex[:8]}",
        workflow_state="APPLIED",
        outcome_status="SUBMITTED",
        applied_at=past_date,
        created_at=past_date,
    )
    db_session.add(app_past)
    await db_session.commit()

    # 7D preset boundary (should exclude app_past, only include today's app_1)
    seven_days_ago = (now - timedelta(days=7)).isoformat()
    now_iso = (now + timedelta(hours=1)).isoformat()
    f_7d = (await client.get(
        "/api/v1/analytics/funnel",
        params={"start_date": seven_days_ago, "end_date": now_iso},
        headers=headers_a,
    )).json()
    assert f_7d["total_submitted"] == 1  # Only app_1

    # 30D / All Time preset (should include both app_1 and app_past)
    thirty_days_ago = (now - timedelta(days=30)).isoformat()
    f_30d = (await client.get(
        "/api/v1/analytics/funnel",
        params={"start_date": thirty_days_ago, "end_date": now_iso},
        headers=headers_a,
    )).json()
    assert f_30d["total_submitted"] == 2  # app_1 + app_past

    # -------------------------------------------------------------------------
    # CHECK F: Read-Only Surface Audit
    # Analytics routes must strictly reject mutating methods (POST, PUT, DELETE)
    # -------------------------------------------------------------------------
    # 1. /api/v1/analytics/funnel cannot be mutated
    mut_1 = await client.post("/api/v1/analytics/funnel", json={}, headers=headers_a)
    assert mut_1.status_code == 405

    # 2. /api/v1/analytics/campaigns cannot be mutated
    mut_2 = await client.post("/api/v1/analytics/campaigns", json={}, headers=headers_a)
    assert mut_2.status_code == 405

    # 3. /api/v1/analytics/resumes cannot be mutated
    mut_3 = await client.post("/api/v1/analytics/resumes", json={}, headers=headers_a)
    assert mut_3.status_code == 405

    # 4. /api/v1/analytics/sources cannot be mutated
    mut_4 = await client.delete("/api/v1/analytics/sources", headers=headers_a)
    assert mut_4.status_code == 405
