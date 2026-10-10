import asyncio
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.application.automation.orchestrator import orchestrator
from app.domain.connections.entities import ConnectionStatus, ConnectionType, PlatformConnection
from app.infrastructure.database.models.models import CampaignExecutionModel
from app.infrastructure.database.repositories.connection_repository import SqlAlchemyConnectionRepository


@pytest.mark.asyncio
async def test_campaign_execution_automation_synchronization(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    # Mock background pipeline loop so the test executes instantly without launching browser
    async def mock_execute_run_pipeline(session, *args, **kwargs):
        try:
            while not session.cancel_requested:
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            pass

    monkeypatch.setattr(orchestrator, "_execute_run_pipeline", mock_execute_run_pipeline)

    # Mock platform connection repository to return CONNECTED session instantly
    async def mock_get_by_platform(self, user_id, platform):
        return PlatformConnection(
            id="mock-conn-1",
            user_id=user_id,
            platform=platform,
            connection_type=ConnectionType.BROWSER_SESSION,
            status=ConnectionStatus.CONNECTED,
        )

    monkeypatch.setattr(SqlAlchemyConnectionRepository, "get_by_platform", mock_get_by_platform)

    # 1. Register & authenticate user
    user_payload = {
        "email": "sync.test@example.com",
        "password": "Password123!",
        "full_name": "Sync Test Candidate",
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

    # 2. Create campaign
    camp_payload = {
        "name": "Backend Engineering Synchronization Campaign",
        "rule": {
            "auto_apply_threshold": 80.0,
            "target_roles": ["Python Engineer"],
            "target_platforms": ["naukri"],
        },
        "safety_policy": {
            "daily_application_limit": 15,
            "hourly_application_limit": 5,
            "operating_start_time": "00:00",
            "operating_end_time": "23:59",
        },
    }
    camp_res = await client.post("/api/v1/campaigns", json=camp_payload, headers=headers)
    assert camp_res.status_code == 201
    campaign_id = camp_res.json()["id"]

    # 3. Start campaign execution in DB
    start_camp_res = await client.post(f"/api/v1/campaigns/{campaign_id}/start", headers=headers)
    assert start_camp_res.status_code == 202
    execution = start_camp_res.json()
    assert execution["status"] == "RUNNING"
    execution_id = execution["id"]

    # 4. Start runtime automation session wired to the campaign execution
    auto_req = {
        "source_type": "naukri",
        "roles": ["Python Engineer"],
        "auto_apply_matches": False,
        "max_applications": 5,
        "execution_id": execution_id,
        "campaign_id": campaign_id,
    }
    auto_res = await client.post("/api/v1/automation/start", json=auto_req, headers=headers)
    assert auto_res.status_code == 202
    run_data = auto_res.json()
    assert run_data["run_id"] == execution_id

    # 5. Pause from campaign API -> Should signal runtime session to pause
    pause_camp_res = await client.post(f"/api/v1/campaigns/{campaign_id}/pause", headers=headers)
    assert pause_camp_res.status_code == 200
    assert pause_camp_res.json()["status"] == "PAUSED_USER"

    # Verify runtime session is now paused
    run_status_res = await client.get(f"/api/v1/automation/runs/{execution_id}", headers=headers)
    assert run_status_res.status_code == 200
    assert run_status_res.json()["is_paused"] is True
    assert run_status_res.json()["status"] == "PAUSED"

    # 6. Resume from automation API -> Should synchronize DB execution back to RUNNING
    resume_run_res = await client.post(f"/api/v1/automation/runs/{execution_id}/resume", json={}, headers=headers)
    assert resume_run_res.status_code == 200
    assert resume_run_res.json()["is_paused"] is False

    # Check database execution status is RUNNING via pacing endpoint
    pacing_res = await client.get(f"/api/v1/campaigns/{campaign_id}/pacing", headers=headers)
    assert pacing_res.status_code == 200
    assert pacing_res.json()["active_execution_status"] == "RUNNING"

    # 7. Pause from automation API -> Should update DB execution to PAUSED_USER
    pause_run_res = await client.post(f"/api/v1/automation/runs/{execution_id}/pause", headers=headers)
    assert pause_run_res.status_code == 200
    assert pause_run_res.json()["is_paused"] is True

    # Check database execution status is PAUSED_USER via pacing endpoint
    pacing_paused = await client.get(f"/api/v1/campaigns/{campaign_id}/pacing", headers=headers)
    assert pacing_paused.status_code == 200
    assert pacing_paused.json()["active_execution_status"] == "PAUSED_USER"

    # 8. Resume from campaign API -> Should resume runtime session
    resume_camp_res = await client.post(f"/api/v1/campaigns/{campaign_id}/resume", headers=headers)
    assert resume_camp_res.status_code == 200
    assert resume_camp_res.json()["status"] == "RUNNING"

    # Verify runtime session is resumed
    run_res_resumed = await client.get(f"/api/v1/automation/runs/{execution_id}", headers=headers)
    assert run_res_resumed.status_code == 200
    assert run_res_resumed.json()["is_paused"] is False

    # 9. Stop from automation API -> Should mark DB execution as ABORTED
    stop_run_res = await client.post(
        f"/api/v1/automation/runs/{execution_id}/stop",
        json={"reason": "Emergency stop test"},
        headers=headers,
    )
    assert stop_run_res.status_code == 200
    assert stop_run_res.json()["status"] in ["ABORTED", "STOPPED"]

    # Verify DB execution status is ABORTED in database model
    db_session.expire_all()
    stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == execution_id)
    db_exec = await db_session.scalar(stmt)
    assert db_exec is not None
    assert db_exec.status == "ABORTED"
