import pytest
from httpx import AsyncClient
from app.api.deps import get_ai_gateway
from tests.unit.test_ai_gateway import MockGroqProvider, MockGeminiProvider
from app.infrastructure.ai.gateway import MultiTierAIGateway


@pytest.mark.asyncio
async def test_matching_api_flow(client: AsyncClient, monkeypatch):
    # 1. Override AI Gateway with mock to avoid external API dependencies
    def override_get_ai_gateway():
        return MultiTierAIGateway(primary_provider=MockGroqProvider(), fallback_provider=MockGeminiProvider())

    from main import app
    app.dependency_overrides[get_ai_gateway] = override_get_ai_gateway

    # 2. Register candidate user
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "candidate_matching@example.com", "password": "Password123!", "full_name": "Match Candidate"},
    )
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Setup candidate profile
    await client.put(
        "/api/v1/profile",
        json={
            "headline": "Senior Data Engineer",
            "summary": "Building scalable pipelines with Python and Spark",
            "total_experience_months": 48,
            "location": "Bangalore",
        },
        headers=headers,
    )
    await client.post(
        "/api/v1/profile/skills",
        json=[
            {"skill_name": "Python", "years_experience": 4.0, "is_primary": True},
            {"skill_name": "Spark", "years_experience": 3.0, "is_primary": True},
            {"skill_name": "SQL", "years_experience": 4.0, "is_primary": True},
        ],
        headers=headers,
    )

    # 4. Mock discover a job
    from app.infrastructure.browser.adapters.registry import adapter_registry
    from tests.integration.test_jobs_api import MockBrowserManager, MockNaukriSourceAdapter
    from app.application.jobs import use_cases

    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)
    use_cases.browser_manager = MockBrowserManager()

    disc_res = await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_naukri", "roles": ["Data Engineer"], "locations": ["Bangalore"]},
        headers=headers,
    )
    assert disc_res.status_code == 200
    job_id = disc_res.json()["jobs"][0]["id"]

    # 5. Evaluate match via API
    eval_res = await client.post(
        f"/api/v1/jobs/matches/{job_id}/evaluate",
        json={"skills_weight": 0.40, "experience_weight": 0.30},
        headers=headers,
    )
    assert eval_res.status_code == 200
    eval_data = eval_res.json()
    assert eval_data["hard_filter_passed"] is True
    assert eval_data["overall_score"] >= 60.0
    assert eval_data["decision"] in ("AUTO_APPLY", "REQUIRE_APPROVAL", "SAVE")

    # 6. List matches via API
    list_res = await client.get("/api/v1/jobs/matches?min_score=50", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert len(list_data) >= 1
    assert list_data[0]["job_id"] == job_id

    # 7. Test Save and Retrieve Matching Weights
    weights_res = await client.post(
        "/api/v1/jobs/matches/weights",
        json={"skills_weight": 0.45, "semantic_weight": 0.35, "experience_weight": 0.20},
        headers=headers,
    )
    assert weights_res.status_code == 200
    assert weights_res.json()["status"] == "success"
    assert weights_res.json()["weights"]["skills_weight"] == 0.45

    get_weights_res = await client.get("/api/v1/jobs/matches/weights", headers=headers)
    assert get_weights_res.status_code == 200
    assert get_weights_res.json()["weights"]["skills_weight"] == 0.45

    # Check analytics reflects the updated weights
    tuning_res = await client.get("/api/v1/analytics/weights-tuning", headers=headers)
    assert tuning_res.status_code == 200
    assert tuning_res.json()["current_skill_weight"] == 0.45

    app.dependency_overrides.clear()
