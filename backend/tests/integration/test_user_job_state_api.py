import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.infrastructure.database.models.models import JobModel, JobSourceModel, UserModel, UserJobStateModel


@pytest.mark.asyncio
async def test_save_unsave_and_dismiss_api_flow(client: AsyncClient, db_session):
    # Setup test user and source
    user = UserModel(id="usr-state-1", email="userstate1@example.com", hashed_password="dummy")
    source = JobSourceModel(id="src-api-1", source_type="naukri", base_url="https://naukri.com", is_active=True)
    job1 = JobModel(
        id="job-api-1",
        source_id="src-api-1",
        external_job_id="ext-api-1",
        title="Frontend Lead",
        company="SaaS Corp",
        location="Remote",
        apply_url="https://example.com/apply1",
        raw_description="React, TypeScript",
        lifecycle_state="ACTIVE",
        is_active=True,
    )
    job2 = JobModel(
        id="job-api-2",
        source_id="src-api-1",
        external_job_id="ext-api-2",
        title="Backend Lead",
        company="SaaS Corp",
        location="Remote",
        apply_url="https://example.com/apply2",
        raw_description="Python, FastAPI",
        lifecycle_state="ACTIVE",
        is_active=True,
    )
    db_session.add_all([user, source, job1, job2])
    await db_session.commit()

    token = create_access_token({"sub": "usr-state-1"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Save job 1
    res = await client.post("/api/v1/jobs/job-api-1/save", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "saved"
    assert data["is_saved"] is True

    # Verify persisted in database
    db_session.expire_all()
    db_res = await db_session.execute(
        select(UserJobStateModel).where(
            UserJobStateModel.user_id == "usr-state-1",
            UserJobStateModel.job_id == "job-api-1",
        )
    )
    state = db_res.scalar_one()
    assert state.is_saved is True
    assert state.saved_at is not None

    # 2. List saved jobs
    saved_res = await client.get("/api/v1/jobs/user/saved", headers=headers)
    assert saved_res.status_code == 200
    saved_data = saved_res.json()
    assert saved_data["total"] == 1
    assert saved_data["items"][0]["id"] == "job-api-1"
    assert saved_data["items"][0]["is_saved"] is True

    # 3. Dismiss job 2
    dismiss_res = await client.post("/api/v1/jobs/job-api-2/dismiss", headers=headers)
    assert dismiss_res.status_code == 200
    assert dismiss_res.json()["is_dismissed"] is True

    # 4. List jobs (default include_dismissed=False): job-api-2 should be excluded
    list_res = await client.get("/api/v1/jobs", headers=headers)
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    item_ids = [j["id"] for j in items]
    assert "job-api-1" in item_ids
    assert "job-api-2" not in item_ids

    # 5. List jobs with include_dismissed=True: job-api-2 should be included
    list_incl_res = await client.get("/api/v1/jobs?include_dismissed=true", headers=headers)
    assert list_incl_res.status_code == 200
    incl_items = list_incl_res.json()["items"]
    incl_item_ids = [j["id"] for j in incl_items]
    assert "job-api-2" in incl_item_ids

    # 6. Unsave job 1
    unsave_res = await client.delete("/api/v1/jobs/job-api-1/save", headers=headers)
    assert unsave_res.status_code == 200
    assert unsave_res.json()["is_saved"] is False

    # 7. Undismiss job 2
    undismiss_res = await client.delete("/api/v1/jobs/job-api-2/dismiss", headers=headers)
    assert undismiss_res.status_code == 200
    assert undismiss_res.json()["is_dismissed"] is False
