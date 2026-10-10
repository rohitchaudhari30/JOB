import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_canonical_orchestrator_application_pipeline(client: AsyncClient):
    # 1. Register & authenticate user
    user_payload = {
        "email": "orchestrator.test@example.com",
        "password": "Password123!",
        "full_name": "Orchestrator Test User",
    }
    reg_resp = await client.post("/api/v1/auth/register", json=user_payload)
    assert reg_resp.status_code == 201

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": user_payload["email"], "password": user_payload["password"]},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Ingest two mock jobs
    from app.infrastructure.browser.adapters.registry import adapter_registry
    from tests.integration.test_jobs_api import MockBrowserManager, MockNaukriSourceAdapter
    from app.application.jobs import use_cases

    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)
    use_cases.browser_manager = MockBrowserManager()

    disc_resp = await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_naukri", "roles": ["Software Engineer"], "locations": ["Bangalore"]},
        headers=headers,
    )
    assert disc_resp.status_code == 200
    jobs = disc_resp.json()["jobs"]
    assert len(jobs) >= 1
    job_1_id = jobs[0]["id"]

    # 3. Queue single application via canonical endpoint
    single_req = {
        "job_id": job_1_id,
        "source": "AI_MATCHES",
        "auto_execute": False,
    }
    single_resp = await client.post("/api/v1/applications", json=single_req, headers=headers)
    assert single_resp.status_code == 201
    single_data = single_resp.json()
    assert single_data["job_id"] == job_1_id
    assert single_data["workflow_state"] == "APPROVED"

    # 4. Idempotency test: Re-queueing the exact same job should return 400 DUPLICATE_APPLICATION
    dup_resp = await client.post("/api/v1/applications", json=single_req, headers=headers)
    assert dup_resp.status_code == 400
    assert "DUPLICATE_APPLICATION" in dup_resp.json()["detail"]

    # 5. Batch queueing via canonical batch-queue endpoint
    batch_req = {
        "job_ids": [job_1_id],  # One duplicate
        "source": "JOB_DISCOVERY",
        "auto_execute": False,
    }
    batch_resp = await client.post("/api/v1/applications/batch-queue", json=batch_req, headers=headers)
    assert batch_resp.status_code == 201
    batch_data = batch_resp.json()
    assert batch_data["total_requested"] == 1
    assert batch_data["queued_count"] == 0
    assert batch_data["skipped_count"] == 1
    assert batch_data["results"][0]["error_code"] == "DUPLICATE_APPLICATION"
