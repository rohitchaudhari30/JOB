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
        class MockPage:
            def is_closed(self):
                return False
            async def close(self):
                pass
            async def goto(self, *a, **k):
                pass
            async def wait_for_selector(self, *a, **k):
                pass
            async def query_selector_all(self, *a, **k):
                return []
        class MockContext:
            pages = []
            async def new_page(self):
                return MockPage()
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


class MockLinkedInSourceAdapter(BaseJobSourceAdapter):
    @property
    def source_type(self) -> str:
        return "mock_linkedin"

    async def health_check(self, context) -> bool:
        return True

    async def search_jobs(self, context, filters: SearchQueryFilter):
        # Emits a cross-posted job that has different external_job_id but identical company, title, location, description
        yield Job(
            id="job_mock_linkedin_1",
            source_id="mock_linkedin",
            external_job_id="linkedin_ext_9999",
            title="Lead Data Engineer",
            company="Enterprise Cloud Solutions Pvt Ltd",
            location="Bengaluru, Karnataka",
            min_experience_years=4.0,
            max_experience_years=8.0,
            apply_url="https://www.linkedin.com/jobs/view/9999",
            raw_description="Looking for an experienced Lead Data Engineer.",
        )

    async def fetch_job_details(self, context, external_job_id: str, apply_url: str):
        return None


@pytest.mark.asyncio
async def test_cross_platform_canonical_deduplication(client: AsyncClient, monkeypatch):
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "crossplatform@example.com", "password": "Password123!", "full_name": "Portal Hunter"},
    )
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    adapter_registry.register_source("mock_naukri_cross", MockNaukriSourceAdapter)
    adapter_registry.register_source("mock_linkedin_cross", MockLinkedInSourceAdapter)

    from app.application.jobs import use_cases
    use_cases.browser_manager = MockBrowserManager()

    # 1. Ingest from Naukri mock
    disc_naukri = await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_naukri_cross", "roles": ["Data Engineer"], "locations": ["Bangalore"]},
        headers=headers,
    )
    assert disc_naukri.status_code == 200
    assert disc_naukri.json()["new_jobs_count"] == 2

    # 2. Ingest from LinkedIn mock with canonical duplicate
    disc_linkedin = await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_linkedin_cross", "roles": ["Data Engineer"], "locations": ["Bengaluru"]},
        headers=headers,
    )
    assert disc_linkedin.status_code == 200
    disc_data = disc_linkedin.json()
    # The duplicate cross-posted job should be caught by canonical key deduplication!
    assert disc_data["skipped_duplicates"] == 1
    assert disc_data["new_jobs_count"] == 0


@pytest.mark.asyncio
async def test_pagination_and_sorting_flow(client: AsyncClient):
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "paginator@example.com", "password": "Password123!", "full_name": "Page Tester"},
    )
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    adapter_registry.register_source("mock_naukri_page", MockNaukriSourceAdapter)
    from app.application.jobs import use_cases
    use_cases.browser_manager = MockBrowserManager()

    # Ingest mock jobs first to test pagination
    await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_naukri_page", "roles": ["Data Engineer"], "locations": ["Bangalore"]},
        headers=headers,
    )

    # Verify pagination parameters
    res_page1 = await client.get("/api/v1/jobs?skip=0&limit=1", headers=headers)
    assert res_page1.status_code == 200
    data_page1 = res_page1.json()
    assert data_page1["skip"] == 0
    assert data_page1["limit"] == 1
    assert len(data_page1["items"]) == 1
    assert data_page1["total"] >= 2

    # Verify second page
    res_page2 = await client.get("/api/v1/jobs?skip=1&limit=1", headers=headers)
    assert res_page2.status_code == 200
    data_page2 = res_page2.json()
    assert len(data_page2["items"]) == 1
    assert data_page2["items"][0]["id"] != data_page1["items"][0]["id"]

    # Verify sorting
    res_sort = await client.get("/api/v1/jobs?sort_by=salary_high_to_low", headers=headers)
    assert res_sort.status_code == 200
    items = res_sort.json()["items"]
    assert len(items) >= 2
    if items[0].get("max_salary") and items[1].get("max_salary"):
        assert items[0]["max_salary"] >= items[1]["max_salary"]


@pytest.mark.asyncio
@pytest.mark.file_db
async def test_concurrent_job_ingestion_race_recovery():
    """Verifies that concurrent insertions of identical/canonical jobs recover safely without unhandled integrity errors."""
    import asyncio
    from app.core.database import AsyncSessionLocal
    from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
    from app.domain.jobs.identity import CanonicalJobIdentifier

    job_template = Job(
        id="job_concur_1",
        source_id="test_concur_source",
        external_job_id="concur_ext_1",
        title="Concurrent Staff Engineer",
        company="Acme Concurrency Corp",
        location="Bengaluru",
        min_experience_years=5.0,
        max_experience_years=10.0,
        min_salary=3000000.0,
        max_salary=4500000.0,
        apply_url="https://example.com/jobs/concur-1",
        raw_description="High-scale distributed systems work.",
    )
    canon_key, _ = CanonicalJobIdentifier.compute_canonical_key(
        company=job_template.company,
        title=job_template.title,
        location=job_template.location,
        description=job_template.raw_description,
    )
    job_template.canonical_job_key = canon_key

    # Run 5 concurrent save operations using separate sessions and connections
    async def worker_save(idx: int):
        async with AsyncSessionLocal() as session:
            repo = SqlAlchemyJobRepository(session)
            # Create a clone with distinct internal id but same external and canonical identity
            worker_job = Job(
                id=f"job_concur_worker_{idx}",
                source_id=job_template.source_id,
                external_job_id=job_template.external_job_id,
                title=job_template.title,
                company=job_template.company,
                location=job_template.location,
                min_experience_years=job_template.min_experience_years,
                max_experience_years=job_template.max_experience_years,
                min_salary=job_template.min_salary,
                max_salary=job_template.max_salary,
                apply_url=job_template.apply_url,
                raw_description=job_template.raw_description,
                canonical_job_key=canon_key,
            )
            saved = await repo.save(worker_job)
            await session.commit()
            return saved

    saved_jobs = await asyncio.gather(*[worker_save(i) for i in range(5)])
    assert len(saved_jobs) == 5
    for j in saved_jobs:
        assert j is not None
        assert j.canonical_job_key == canon_key

    # Query total records in DB for this external_id: exactly 1 must exist
    async with AsyncSessionLocal() as session:
        repo = SqlAlchemyJobRepository(session)
        matching = await repo.get_by_external_id(job_template.source_id, job_template.external_job_id)
        assert matching is not None
        assert matching.title == "Concurrent Staff Engineer"





async def _login(client, email):
    payload = {"email": email, "password": "Password123!", "full_name": "Job Tester"}
    await client.post("/api/v1/auth/register", json=payload)
    res = await client.post("/api/v1/auth/login", json={"email": email, "password": payload["password"]})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_regular_user_cannot_delete_or_clear_shared_jobs(client):
    """SEC-01: jobs are shared, so deleting them needs an administrator."""
    headers = await _login(client, "regular.user@example.com")
    assert (await client.delete("/api/v1/jobs/some-job", headers=headers)).status_code == 403
    assert (await client.delete("/api/v1/jobs", headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_admin_can_clear_jobs(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "ADMIN_EMAILS", "boss@example.com")
    headers = await _login(client, "boss@example.com")
    res = await client.delete("/api/v1/jobs", headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "cleared"
