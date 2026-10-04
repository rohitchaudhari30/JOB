import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_analytics_api_endpoints_flow(client: AsyncClient):
    # Register a test user
    register_payload = {
        "email": "analytics_user@example.com",
        "password": "SecurePassword123!",
        "full_name": "Analytics Candidate",
    }
    reg_res = await client.post("/api/v1/auth/register", json=register_payload)
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Funnel overview
    funnel_res = await client.get("/api/v1/analytics/funnel", headers=headers)
    assert funnel_res.status_code == 200
    funnel_data = funnel_res.json()
    assert "stages" in funnel_data
    assert isinstance(funnel_data["stages"], list)
    assert len(funnel_data["stages"]) == 4

    # 2. Resume performance
    resumes_res = await client.get("/api/v1/analytics/resumes", headers=headers)
    assert resumes_res.status_code == 200
    assert isinstance(resumes_res.json(), list)

    # 3. Source performance
    sources_res = await client.get("/api/v1/analytics/sources", headers=headers)
    assert sources_res.status_code == 200
    assert isinstance(sources_res.json(), list)

    # 4. Skill demand insights
    skills_res = await client.get("/api/v1/analytics/skills", headers=headers)
    assert skills_res.status_code == 200
    assert isinstance(skills_res.json(), list)

    # 5. Weight tuning recommendations
    weights_res = await client.get("/api/v1/analytics/weights-tuning", headers=headers)
    assert weights_res.status_code == 200
    weights_data = weights_res.json()
    assert "recommended_skill_weight" in weights_data
    assert "recommended_semantic_weight" in weights_data
    assert "rationale" in weights_data
