import pytest
from httpx import AsyncClient
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseJobSourceAdapter
from app.infrastructure.browser.adapters.registry import adapter_registry


class MockNaukriSourceAdapter(BaseJobSourceAdapter):
    @property
    def source_type(self) -> str:
        return "mock_naukri"

    async def health_check(self, context) -> bool:
        return True

    async def search_jobs(self, context, filters: SearchQueryFilter):
        # Emits 2 mocked jobs (one of which will be repeated to test deduplication)
        yield Job(
            id="job_mock_1",
            source_id="mock_naukri",
            external_job_id="naukri_ext_1001",
            title="Lead Data Engineer",
            company="Enterprise Cloud Solutions",
            location="Bangalore",
            min_experience_years=4.0,
            max_experience_years=8.0,
            min_salary=2000000.0,
            max_salary=3000000.0,
            apply_url="https://www.naukri.com/job-listings-1001",
            raw_description="Looking for an experienced Lead Data Engineer.",
        )
        yield Job(
            id="job_mock_2",
            source_id="mock_naukri",
            external_job_id="naukri_ext_1002",
            title="Senior Python Backend Developer",
            company="ScaleFintech",
            location="Pune",
            min_experience_years=3.0,
            max_experience_years=6.0,
            min_salary=1500000.0,
            max_salary=2500000.0,
            apply_url="https://www.naukri.com/job-listings-1002",
            raw_description="Building high-frequency financial microservices.",
        )

    async def fetch_job_details(self, context, external_job_id: str, apply_url: str):
        return None


class MockBrowserManager:
    async def create_isolated_context(self, encrypted_storage_state=None, *args, **kwargs):
        class MockContext:
            async def close(self):
                pass
        return MockContext()


@pytest.mark.asyncio
async def test_job_discovery_and_deduplication_flow(client: AsyncClient, monkeypatch):
    # 1. Register test user & get JWT token
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "recruiter@example.com", "password": "Password123!", "full_name": "Job Hunter"},
    )
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Register mock source adapter
    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)

    # Monkeypatch browser manager in DiscoverJobsUseCase
    from app.application.jobs import use_cases
    use_cases.browser_manager = MockBrowserManager()

    # 2. Trigger first discovery run
    discover_payload = {
        "source_type": "mock_naukri",
        "roles": ["Data Engineer"],
        "locations": ["Bangalore", "Pune"],
    }
    disc_res1 = await client.post("/api/v1/jobs/discover", json=discover_payload, headers=headers)
    assert disc_res1.status_code == 200
    disc_data1 = disc_res1.json()
    assert disc_data1["discovered_total"] == 2
    assert disc_data1["new_jobs_count"] == 2
    assert disc_data1["skipped_duplicates"] == 0

    # 3. Trigger second discovery run with exact same mock jobs -> Deduplication should catch them!
    disc_res2 = await client.post("/api/v1/jobs/discover", json=discover_payload, headers=headers)
    assert disc_res2.status_code == 200
    disc_data2 = disc_res2.json()
    assert disc_data2["discovered_total"] == 2
    assert disc_data2["new_jobs_count"] == 0
    assert disc_data2["skipped_duplicates"] == 2

    # 4. List jobs via API
    list_res = await client.get("/api/v1/jobs", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] == 2
    assert len(list_data["items"]) == 2

    # 5. Search jobs by title query
    search_res = await client.get("/api/v1/jobs?search=Python", headers=headers)
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert len(search_data["items"]) == 1
    assert search_data["items"][0]["title"] == "Senior Python Backend Developer"

    # 6. Fetch details for specific job
    job_id = search_data["items"][0]["id"]
    detail_res = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert detail_res.status_code == 200
    detail_data = detail_res.json()
    assert detail_data["company"] == "ScaleFintech"
    assert "Building high-frequency" in detail_data["raw_description"]
