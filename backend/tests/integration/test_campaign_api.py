import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_campaign_api_lifecycle(client: AsyncClient):
    # 1. Register & Login User
    user_payload = {
        "email": "campaign.pilot@example.com",
        "password": "Password123!",
        "full_name": "Campaign Operator",
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

    # 2. Create Campaign
    create_payload = {
        "name": "Senior Backend & Cloud Campaign",
        "rule": {
            "auto_apply_threshold": 82.0,
            "review_threshold": 68.0,
            "min_experience_years": 3.0,
            "max_experience_years": 8.0,
            "target_roles": ["Senior Backend Engineer", "Staff Software Engineer"],
            "target_locations": ["Bangalore", "Remote"],
            "mandatory_skills": ["Python", "FastAPI", "PostgreSQL"],
            "excluded_keywords": ["PHP", "WordPress"],
            "target_platforms": ["naukri", "linkedin"],
        },
        "safety_policy": {
            "daily_application_limit": 15,
            "hourly_application_limit": 4,
            "cooldown_seconds": 60,
            "operating_start_time": "08:00",
            "operating_end_time": "20:00",
            "max_concurrent_applications": 1,
        },
        "schedule": {
            "is_active": True,
            "interval_minutes": 180,
        },
    }
    create_resp = await client.post("/api/v1/campaigns", json=create_payload, headers=headers)
    assert create_resp.status_code == 201
    campaign = create_resp.json()
    campaign_id = campaign["id"]
    assert campaign["name"] == "Senior Backend & Cloud Campaign"
    assert campaign["state"] == "DRAFT"
    assert campaign["rule"]["auto_apply_threshold"] == 82.0
    assert campaign["safety_policy"]["daily_application_limit"] == 15

    # 3. List Campaigns
    list_resp = await client.get("/api/v1/campaigns", headers=headers)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) >= 1

    # 4. Get Campaign Details
    get_resp = await client.get(f"/api/v1/campaigns/{campaign_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == campaign_id

    # 5. Get Campaign Pacing Status
    pacing_resp = await client.get(f"/api/v1/campaigns/{campaign_id}/pacing", headers=headers)
    assert pacing_resp.status_code == 200
    pacing = pacing_resp.json()
    assert pacing["daily_limit"] == 15
    assert pacing["hourly_limit"] == 4

    # 6. Start Campaign Execution
    start_resp = await client.post(f"/api/v1/campaigns/{campaign_id}/start", headers=headers)
    assert start_resp.status_code == 202
    execution = start_resp.json()
    assert execution["campaign_id"] == campaign_id
    assert execution["status"] in ("RUNNING", "PAUSED_LIMIT", "PAUSED_SESSION")

    # 7. Pause Campaign
    pause_resp = await client.post(f"/api/v1/campaigns/{campaign_id}/pause", headers=headers)
    assert pause_resp.status_code == 200
    assert pause_resp.json()["status"] == "PAUSED_USER"

    # 8. Resume Campaign
    resume_resp = await client.post(f"/api/v1/campaigns/{campaign_id}/resume", headers=headers)
    assert resume_resp.status_code == 200
    assert resume_resp.json()["status"] == "RUNNING"

    # 9. List Activity Logs
    logs_resp = await client.get(f"/api/v1/campaigns/{campaign_id}/logs", headers=headers)
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) >= 2  # START and PAUSE/RESUME logs

    # 10. Stop Campaign
    stop_resp = await client.post(f"/api/v1/campaigns/{campaign_id}/stop", headers=headers)
    assert stop_resp.status_code == 200
    assert stop_resp.json()["status"] == "ABORTED"

    # 11. Delete Campaign
    del_resp = await client.delete(f"/api/v1/campaigns/{campaign_id}", headers=headers)
    assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_running_campaign_is_rejected_until_stopped(client: AsyncClient):
    user = {"email": "delete.guard@example.com", "password": "Password123!", "full_name": "Delete Guard"}
    assert (await client.post("/api/v1/auth/register", json=user)).status_code == 201
    login = await client.post("/api/v1/auth/login", json={"email": user["email"], "password": user["password"]})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = await client.post(
        "/api/v1/campaigns",
        json={"name": "Guarded", "rule": {"auto_apply_threshold": 80.0, "review_threshold": 60.0}},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    campaign_id = created.json()["id"]

    start = await client.post(f"/api/v1/campaigns/{campaign_id}/start", headers=headers)
    assert start.status_code == 202

    blocked = await client.delete(f"/api/v1/campaigns/{campaign_id}", headers=headers)
    assert blocked.status_code == 409
    assert (await client.get(f"/api/v1/campaigns/{campaign_id}", headers=headers)).status_code == 200

    assert (await client.post(f"/api/v1/campaigns/{campaign_id}/stop", headers=headers)).status_code == 200
    assert (await client.delete(f"/api/v1/campaigns/{campaign_id}", headers=headers)).status_code == 204

    # unknown / other user's id still 404
    assert (await client.delete(f"/api/v1/campaigns/{campaign_id}", headers=headers)).status_code == 404
