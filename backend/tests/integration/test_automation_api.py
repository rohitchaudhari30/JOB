import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
@pytest.mark.file_db
@pytest.mark.xfail(
    strict=True,
    reason="AUT-01: request session holds an uncommitted write while the orchestrator "
    "writes on another connection (database is locked). Remove once Phase 2 commits per step.",
)
async def test_automation_api_and_schedules_flow(client: AsyncClient):
    # 1. Register & Login User
    user_payload = {
        "email": "automation.operator@example.com",
        "password": "Password123!",
        "full_name": "Automation Operator",
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

    # 2. Setup Profile
    profile_payload = {
        "headline": "Lead Automation Architect",
        "summary": "Building scalable platforms with Python",
        "phone": "+919876543210",
        "location": "Bengaluru",
        "current_ctc": 3000000.0,
        "expected_ctc": 4500000.0,
        "total_experience_months": 72,
    }
    await client.put("/api/v1/profile", json=profile_payload, headers=headers)

    # 3. Trigger Automation Run
    start_payload = {
        "source_type": "naukri",
        "roles": ["Lead Engineer", "Staff Engineer"],
        "locations": ["Bengaluru"],
        "auto_apply_matches": False,
        "max_applications": 5,
    }
    start_resp = await client.post("/api/v1/automation/start", json=start_payload, headers=headers)
    assert start_resp.status_code == 202
    run_data = start_resp.json()
    run_id = run_data["run_id"]
    assert run_data["status"] == "RUNNING"

    # 4. Get Run Status
    status_resp = await client.get(f"/api/v1/automation/runs/{run_id}", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["run_id"] == run_id

    # 5. Pause Run
    pause_resp = await client.post(f"/api/v1/automation/runs/{run_id}/pause", headers=headers)
    assert pause_resp.status_code == 200
    assert pause_resp.json()["is_paused"] is True

    # 6. Resume Run
    resume_resp = await client.post(
        f"/api/v1/automation/runs/{run_id}/resume",
        json={"user_input": "user_verified_code"},
        headers=headers,
    )
    assert resume_resp.status_code == 200
    assert resume_resp.json()["is_paused"] is False

    # 7. Stop Run
    stop_resp = await client.post(
        f"/api/v1/automation/runs/{run_id}/stop",
        json={"reason": "Test stop"},
        headers=headers,
    )
    assert stop_resp.status_code == 200
    assert stop_resp.json()["status"] == "ABORTED"

    # 8. Create Scheduled Automation Job
    sched_payload = {
        "source_type": "naukri",
        "roles": ["Staff Engineer"],
        "locations": ["Bengaluru"],
        "interval_minutes": 120,
        "auto_apply": True,
        "max_applications_per_run": 5,
    }
    sched_resp = await client.post("/api/v1/automation/schedules", json=sched_payload, headers=headers)
    assert sched_resp.status_code == 201
    sched_data = sched_resp.json()
    sched_id = sched_data["schedule_id"]
    assert sched_data["interval_minutes"] == 120

    # 9. List Schedules
    list_sched_resp = await client.get("/api/v1/automation/schedules", headers=headers)
    assert list_sched_resp.status_code == 200
    schedules = list_sched_resp.json()
    assert len(schedules) >= 1
    assert any(s["schedule_id"] == sched_id for s in schedules)

    # 10. Delete Schedule
    del_resp = await client.delete(f"/api/v1/automation/schedules/{sched_id}", headers=headers)
    assert del_resp.status_code == 204

    # 11. Verify Run Persistence and Database Rehydration
    # Query run events while in memory
    events_mem_resp = await client.get(f"/api/v1/automation/runs/{run_id}/events", headers=headers)
    assert events_mem_resp.status_code == 200

    # Evict session from orchestrator memory to test database fallback & rehydration
    from app.application.automation.orchestrator import orchestrator
    if run_id in orchestrator._sessions:
        del orchestrator._sessions[run_id]

    status_db_resp = await client.get(f"/api/v1/automation/runs/{run_id}", headers=headers)
    assert status_db_resp.status_code == 200
    assert status_db_resp.json()["run_id"] == run_id

    events_db_resp = await client.get(f"/api/v1/automation/runs/{run_id}/events", headers=headers)
    assert events_db_resp.status_code == 200
    assert isinstance(events_db_resp.json(), list)
