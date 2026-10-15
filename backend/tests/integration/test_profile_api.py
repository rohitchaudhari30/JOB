import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_profile_crud_flow(client: AsyncClient):
    # 1. Register user
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "candidate_profile@example.com", "password": "Password123!", "full_name": "Jane Dev"},
    )
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Get initial profile
    get_res = await client.get("/api/v1/profile", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["currency"] == "INR"

    # 3. Update profile
    update_payload = {
        "headline": "Lead Data Architect",
        "current_ctc": 2500000.0,
        "expected_ctc": 3500000.0,
        "notice_period_days": 15,
        "location": "Bangalore",
        "work_authorization": "Citizen",
    }
    put_res = await client.put("/api/v1/profile", json=update_payload, headers=headers)
    assert put_res.status_code == 200
    profile_data = put_res.json()
    assert profile_data["headline"] == "Lead Data Architect"
    assert profile_data["expected_ctc"] == 3500000.0

    # 4. Add experience
    exp_payload = {
        "company_name": "Cloud Enterprise Inc",
        "title": "Senior Data Engineer",
        "location": "Bangalore",
        "is_current": True,
        "description": "Architected distributed ETL pipelines.",
    }
    exp_res = await client.post("/api/v1/profile/experiences", json=exp_payload, headers=headers)
    assert exp_res.status_code == 201
    exp_id = exp_res.json()["id"]

    # 5. Add education
    edu_payload = {
        "institution": "National Institute of Technology",
        "degree": "B.Tech Computer Science",
        "start_year": 2016,
        "end_year": 2020,
    }
    edu_res = await client.post("/api/v1/profile/educations", json=edu_payload, headers=headers)
    assert edu_res.status_code == 201

    # 6. Sync skills
    skills_payload = [
        {"skill_name": "Python", "years_experience": 5.0, "is_primary": True},
        {"skill_name": "Apache Spark", "years_experience": 4.0, "is_primary": True},
        {"skill_name": "PostgreSQL", "years_experience": 5.0, "is_primary": False},
    ]
    skills_res = await client.post("/api/v1/profile/skills", json=skills_payload, headers=headers)
    assert skills_res.status_code == 200
    assert len(skills_res.json()) == 3

    # 7. Save custom answer
    ans_payload = {
        "canonical_intent": "NOTICE_PERIOD",
        "question_pattern": "What is your official notice period?",
        "answer_text": "15 Days (Negotiable for immediate buyout)",
    }
    ans_res = await client.post("/api/v1/profile/saved-answers", json=ans_payload, headers=headers)
    assert ans_res.status_code == 200
    assert ans_res.json()["canonical_intent"] == "NOTICE_PERIOD"

    # 8. Verify full profile has experiences, educations, and skills
    final_res = await client.get("/api/v1/profile", headers=headers)
    final_data = final_res.json()
    assert len(final_data["experiences"]) == 1
    assert len(final_data["educations"]) == 1
    assert len(final_data["skills"]) == 3


async def _auth_headers(client, email="lists.user@example.com"):
    payload = {"email": email, "password": "Password123!", "full_name": "Lists User"}
    assert (await client.post("/api/v1/auth/register", json=payload)).status_code == 201
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": payload["password"]}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.mark.asyncio
async def test_put_profile_saves_skills_experiences_and_educations(client):
    """PRF-01: lists sent to PUT /profile must survive a reload."""
    headers = await _auth_headers(client)
    body = {
        "headline": "Backend Engineer",
        "skills": [
            {"skill_name": "Python", "years_experience": 5, "is_primary": True},
            {"skill_name": "FastAPI", "years_experience": 3},
        ],
        "experiences": [
            {"company_name": "Acme", "title": "Engineer", "is_current": True},
        ],
        "educations": [
            {"institution": "IIT", "degree": "B.Tech"},
        ],
    }
    put = await client.put("/api/v1/profile", json=body, headers=headers)
    assert put.status_code == 200

    got = (await client.get("/api/v1/profile", headers=headers)).json()
    assert sorted(s["skill_name"] for s in got["skills"]) == ["FastAPI", "Python"]
    assert [e["company_name"] for e in got["experiences"]] == ["Acme"]
    assert [e["institution"] for e in got["educations"]] == ["IIT"]

    # Sending a shorter list replaces, it does not append.
    body["skills"] = [{"skill_name": "Go", "years_experience": 1}]
    await client.put("/api/v1/profile", json=body, headers=headers)
    got = (await client.get("/api/v1/profile", headers=headers)).json()
    assert [s["skill_name"] for s in got["skills"]] == ["Go"]
    assert len(got["experiences"]) == 1


@pytest.mark.asyncio
async def test_put_profile_without_lists_keeps_existing_lists(client):
    headers = await _auth_headers(client, "keep.lists@example.com")
    await client.put(
        "/api/v1/profile",
        json={"skills": [{"skill_name": "Python", "years_experience": 2}]},
        headers=headers,
    )
    await client.put("/api/v1/profile", json={"headline": "New headline"}, headers=headers)
    got = (await client.get("/api/v1/profile", headers=headers)).json()
    assert got["headline"] == "New headline"
    assert [s["skill_name"] for s in got["skills"]] == ["Python"]
