import asyncio
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.application.automation.orchestrator import AutomationState, orchestrator
from app.domain.connections.entities import ConnectionStatus, ConnectionType, PlatformConnection
from app.infrastructure.database.models.models import CampaignActivityLogModel, CampaignExecutionModel
from app.infrastructure.database.repositories.connection_repository import SqlAlchemyConnectionRepository


@pytest.mark.asyncio
async def test_worker_heartbeat_renewal_and_reclamation(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    # Mock background pipeline loop so test runs quickly without browser
    async def mock_execute_run_pipeline(session, *args, **kwargs):
        try:
            while not session.cancel_requested:
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            pass

    monkeypatch.setattr(orchestrator, "_execute_run_pipeline", mock_execute_run_pipeline)

    # Mock platform connection repository to return CONNECTED session
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
        "email": "worker.heartbeat@example.com",
        "password": "Password123!",
        "full_name": "Reliability Tester",
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
        "name": "Reliability Test Campaign",
        "rule": {
            "auto_apply_threshold": 80.0,
            "target_roles": ["SRE Engineer"],
            "target_platforms": ["naukri"],
        },
        "safety_policy": {
            "daily_application_limit": 10,
            "hourly_application_limit": 5,
            "operating_start_time": "00:00",
            "operating_end_time": "23:59",
        },
    }
    camp_res = await client.post("/api/v1/campaigns", json=camp_payload, headers=headers)
    assert camp_res.status_code == 201
    campaign_id = camp_res.json()["id"]

    # 3. Start execution in DB
    start_res = await client.post(f"/api/v1/campaigns/{campaign_id}/start?worker_id=worker-alpha", headers=headers)
    assert start_res.status_code == 202
    execution = start_res.json()
    execution_id = execution["id"]
    assert execution["status"] == "RUNNING"
    assert execution["worker_id"] == "worker-alpha"

    # 4. Renew worker lease via campaign heartbeat endpoint
    hb_res_1 = await client.post(
        f"/api/v1/campaigns/{campaign_id}/heartbeat?worker_id=worker-alpha&lease_seconds=400",
        headers=headers,
    )
    assert hb_res_1.status_code == 200
    hb_data_1 = hb_res_1.json()
    assert hb_data_1["id"] == execution_id
    assert hb_data_1["worker_id"] == "worker-alpha"

    # 5. Renew worker lease via direct execution heartbeat endpoint (owner worker-alpha)
    hb_res_2 = await client.post(
        f"/api/v1/campaigns/executions/{execution_id}/heartbeat?worker_id=worker-alpha&lease_seconds=200",
        headers=headers,
    )
    assert hb_res_2.status_code == 200
    hb_data_2 = hb_res_2.json()
    assert hb_data_2["worker_id"] == "worker-alpha"

    # Fencing check: Rogue worker-beta heartbeat is rejected
    hb_res_rogue = await client.post(
        f"/api/v1/campaigns/executions/{execution_id}/heartbeat?worker_id=worker-beta&lease_seconds=200",
        headers=headers,
    )
    assert hb_res_rogue.status_code == 409

    # 6. Simulate worker crash: expire lease in DB
    db_session.expire_all()
    stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == execution_id)
    db_exec = await db_session.scalar(stmt)
    assert db_exec is not None
    past_time = datetime.now(timezone.utc) - timedelta(seconds=60)
    db_exec.lease_expires_at = past_time
    await db_session.commit()

    # 7. Reclaim abandoned executions via sweeper endpoint
    reclaim_res = await client.post("/api/v1/campaigns/leases/reclaim", headers=headers)
    assert reclaim_res.status_code == 200
    assert reclaim_res.json()["reclaimed_executions"] >= 1

    # 8. Verify execution was transitioned to RECOVERY_PENDING with explanation in DB
    db_session.expire_all()
    stmt_check = select(CampaignExecutionModel).where(CampaignExecutionModel.id == execution_id)
    reclaimed_exec = await db_session.scalar(stmt_check)
    assert reclaimed_exec.status == "RECOVERY_PENDING"
    assert "lease expired" in (reclaimed_exec.error_message or "").lower()
    assert reclaimed_exec.lease_version >= 2

    # 9. Verify LEASE_EXPIRED audit log was created
    stmt_log = select(CampaignActivityLogModel).where(
        CampaignActivityLogModel.execution_id == execution_id,
        CampaignActivityLogModel.event_type == "LEASE_EXPIRED",
    )
    log_entry = await db_session.scalar(stmt_log)
    assert log_entry is not None
    assert log_entry.level == "WARNING"
    assert "worker_id" in log_entry.payload

    # 10. Start execution for campaign - recovers and acquires the execution safely
    restart_res = await client.post(f"/api/v1/campaigns/{campaign_id}/start?worker_id=worker-gamma", headers=headers)
    assert restart_res.status_code == 202
    new_exec = restart_res.json()
    assert new_exec["id"] == execution_id  # Recovered existing execution without duplicate
    assert new_exec["status"] == "RUNNING"
    assert new_exec["worker_id"] == "worker-gamma"
    assert new_exec["lease_version"] >= 3


@pytest.mark.asyncio
async def test_in_memory_orchestrator_heartbeat_loop(db_session: AsyncSession):
    # Test that _run_heartbeat_loop successfully updates CampaignExecutionModel
    now = datetime.now(timezone.utc)
    test_exec = CampaignExecutionModel(
        id="cexec_hb_test_123",
        campaign_id="camp_hb_test_123",
        user_id="user_hb_test_123",
        status="RUNNING",
        worker_id="worker-test",
        heartbeat_at=now,
        lease_expires_at=now + timedelta(seconds=60),
        started_at=now,
    )
    db_session.add(test_exec)
    await db_session.commit()

    from app.application.automation.orchestrator import AutomationSession
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignExecutionRepository
    session = AutomationSession(
        run_id="run_hb_test",
        user_id="user_hb_test_123",
        execution_id="cexec_hb_test_123",
        worker_id="worker-test",
    )
    session.transition_to(AutomationState.STARTING)
    session.transition_to(AutomationState.RUNNING)

    exec_repo = SqlAlchemyCampaignExecutionRepository(db_session)

    # Run heartbeat loop for a brief tick with very short interval
    hb_task = asyncio.create_task(
        orchestrator._run_heartbeat_loop(session, interval_seconds=0.05, execution_repo=exec_repo)
    )
    await asyncio.sleep(0.12)
    session.cancel_requested = True
    await hb_task

    # Verify heartbeat was updated in the database
    db_session.expire_all()
    stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == "cexec_hb_test_123")
    updated = await db_session.scalar(stmt)
    assert updated is not None
    updated_hb = updated.heartbeat_at if updated.heartbeat_at.tzinfo else updated.heartbeat_at.replace(tzinfo=timezone.utc)
    assert updated_hb >= now
    updated_lease = updated.lease_expires_at if updated.lease_expires_at.tzinfo else updated.lease_expires_at.replace(tzinfo=timezone.utc)
    assert updated_lease > now + timedelta(seconds=200)
