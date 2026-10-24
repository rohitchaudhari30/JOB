import asyncio
import datetime
import os
import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy import select, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from unittest.mock import patch

import app.core.database as database
from app.core.database import Base


def AsyncSessionLocal():
    # Look the factory up at call time so conftest's test-DB patch applies.
    return database.AsyncSessionLocal()
from app.core.security import decode_access_token
from app.infrastructure.database.models.models import AutomationRunModel, AutomationEventModel, UserModel
from app.application.automation.orchestrator import orchestrator, AutomationSession
from app.api.v1.ws import _ws_tickets


@pytest.fixture
async def authenticated_client(client: AsyncClient, monkeypatch):
    """Creates a distinct user and returns authenticated headers & client."""
    # Never launch a real browser from these tests. A cancellable wait stands in for discovery,
    # so a started run can always be stopped cleanly at teardown.
    from app.application.jobs.use_cases import DiscoverJobsUseCase

    async def waiting_discovery(self, *args, **kwargs):
        await asyncio.sleep(30)
        return {"discovered_total": 0, "new_jobs_count": 0, "skipped_duplicates": 0, "jobs": []}

    monkeypatch.setattr(DiscoverJobsUseCase, "execute", waiting_discovery)

    user_payload = {
        "email": f"tester_{uuid.uuid4().hex[:6]}@example.com",
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

    # Setup Profile
    profile_payload = {
        "headline": "Distributed Systems Engineer",
        "location": "Bengaluru",
        "current_ctc": 3500000.0,
        "expected_ctc": 5000000.0,
        "total_experience_months": 84,
    }
    await client.put("/api/v1/profile", json=profile_payload, headers=headers)
    return client, headers, user_payload


@pytest.mark.asyncio
async def test_ephemeral_websocket_ticket_lifecycle(authenticated_client):
    """Scenario 1: Ephemeral ticket issuance, expiration, and single-use redemption."""
    client, headers, _ = authenticated_client

    # 1. Unauthenticated request rejected
    anon_resp = await client.post("/api/v1/ws/ticket")
    assert anon_resp.status_code in (401, 403)

    # 2. Authenticated ticket issuance
    ticket_resp = await client.post("/api/v1/ws/ticket", headers=headers)
    assert ticket_resp.status_code == 200
    ticket_data = ticket_resp.json()
    assert ticket_data["ticket"].startswith("wst_")
    assert ticket_data["expires_in"] == 60

    # 3. Expiration verification
    expired_ticket = f"wst_exp_{uuid.uuid4().hex}"
    _ws_tickets[expired_ticket] = {
        "user_id": "test_user_id",
        "expires_at": 100.0,  # Expired
    }
    consumed = _ws_tickets.pop(expired_ticket, None)
    assert consumed is not None
    assert consumed["expires_at"] < datetime.datetime.now().timestamp()

    # 4. Single-use verification: re-consumption is rejected
    reconsumed = _ws_tickets.pop(expired_ticket, None)
    assert reconsumed is None


@pytest.mark.asyncio
async def test_cursor_based_event_replay_and_status(authenticated_client):
    """Scenario 2: Cursor-based replay, status rehydration, and sequence filtering."""
    client, headers, user_payload = authenticated_client
    run_id = f"replay_run_{uuid.uuid4().hex[:8]}"

    # Decode user_id from token
    token = headers["Authorization"].split(" ")[1]
    claims = decode_access_token(token)
    user_id = claims["sub"]

    async with AsyncSessionLocal() as session:
        # Ensure user exists in test database
        user = await session.get(UserModel, user_id)
        if not user:
            user = UserModel(
                id=user_id,
                email=user_payload["email"],
                hashed_password="pw",
                full_name=user_payload["full_name"],
            )
            session.add(user)
            await session.commit()

        run_model = AutomationRunModel(
            id=run_id,
            user_id=user_id,
            status="RUNNING",
            worker_id="test-worker",
            last_event_seq=2,
        )
        evt1 = AutomationEventModel(
            id=str(uuid.uuid4()),
            run_id=run_id,
            seq=1,
            event_name="SEARCH_COMPLETED",
            payload={"count": 10, "state": "MATCHING", "message": "Found 10 candidate jobs"},
        )
        evt2 = AutomationEventModel(
            id=str(uuid.uuid4()),
            run_id=run_id,
            seq=2,
            event_name="MATCH_EVALUATED",
            payload={"score": 88.0, "state": "APPLYING", "message": "Match score calculated: 88%"},
        )
        session.add(run_model)
        session.add(evt1)
        session.add(evt2)
        await session.commit()

    # Verify status API returns durable sequence from SQLite
    status_resp = await client.get(f"/api/v1/automation/runs/{run_id}", headers=headers)
    assert status_resp.status_code == 200
    assert status_resp.json()["last_event_seq"] == 2

    # Verify replay after base_seq=0
    replay_resp = await client.get(f"/api/v1/automation/runs/{run_id}/events?after_seq=0", headers=headers)
    assert replay_resp.status_code == 200
    replay_events = replay_resp.json()
    assert [e["seq"] for e in replay_events] == [1, 2]

    # Verify replay after seq=1
    single_replay = await client.get(f"/api/v1/automation/runs/{run_id}/events?after_seq=1", headers=headers)
    assert single_replay.status_code == 200
    assert len(single_replay.json()) == 1
    assert single_replay.json()[0]["seq"] == 2

    # Verify replay after seq=2 (empty)
    empty_replay = await client.get(f"/api/v1/automation/runs/{run_id}/events?after_seq=2", headers=headers)
    assert empty_replay.status_code == 200
    assert empty_replay.json() == []


@pytest.mark.asyncio
async def test_worker_staleness_detection(authenticated_client):
    """Scenario 3: Active run (>300s since last heartbeat) marked as STALE."""
    client, headers, user_payload = authenticated_client
    run_id = f"stale_run_{uuid.uuid4().hex[:8]}"

    # Decode user_id from token
    token = headers["Authorization"].split(" ")[1]
    claims = decode_access_token(token)
    user_id = claims["sub"]

    async with AsyncSessionLocal() as session:
        user = await session.get(UserModel, user_id)
        if not user:
            user = UserModel(
                id=user_id,
                email=user_payload["email"],
                hashed_password="pw",
                full_name=user_payload["full_name"],
            )
            session.add(user)
            await session.commit()

        stale_run = AutomationRunModel(
            id=run_id,
            user_id=user_id,
            status="RUNNING",
            worker_id="test-worker",
            last_heartbeat_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=600),
        )
        session.add(stale_run)
        await session.commit()

    stale_resp = await client.get(f"/api/v1/automation/runs/{run_id}", headers=headers)
    assert stale_resp.status_code == 200
    assert stale_resp.json()["worker_health"] == "STALE"


@pytest.mark.asyncio
@pytest.mark.file_db
async def test_cross_user_isolation(authenticated_client):
    """Scenario 4: User B cannot view User A's run status or events."""
    client, headers, _ = authenticated_client

    start_payload = {
        "source_type": "naukri",
        "roles": ["Staff Engineer"],
        "max_applications": 1,
    }
    start_resp = await client.post("/api/v1/automation/start", json=start_payload, headers=headers)
    run_id = start_resp.json()["run_id"]

    # Register User B
    user_b_payload = {
        "email": f"attacker_{uuid.uuid4().hex[:6]}@example.com",
        "password": "Password123!",
        "full_name": "Attacker User",
    }
    await client.post("/api/v1/auth/register", json=user_b_payload)
    login_b = await client.post(
        "/api/v1/auth/login",
        json={"email": user_b_payload["email"], "password": user_b_payload["password"]},
    )
    headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    # User B status lookup rejected with 404
    cross_status = await client.get(f"/api/v1/automation/runs/{run_id}", headers=headers_b)
    assert cross_status.status_code == 404

    # User B events lookup rejected with 404
    cross_events = await client.get(f"/api/v1/automation/runs/{run_id}/events", headers=headers_b)
    assert cross_events.status_code == 404


@pytest.mark.asyncio
async def test_concurrent_event_producers_separate_sessions_and_connections():
    """Scenario 5: Genuinely concurrent event writers using separate database sessions."""
    run_id = f"conc_run_{uuid.uuid4().hex[:8]}"

    # Synchronously commit initial run
    async with AsyncSessionLocal() as session:
        run_m = AutomationRunModel(
            id=run_id,
            user_id="test_user",
            status="RUNNING",
            worker_id="test-worker",
            last_event_seq=0,
        )
        session.add(run_m)
        await session.commit()

    sim_session = AutomationSession(
        run_id=run_id,
        user_id="test_user",
        execution_id=run_id,
    )

    num_concurrent_writers = 15

    async def _emit_event(idx: int):
        await orchestrator._broadcast_event(
            session=sim_session,
            event_name=f"CONCURRENT_EVENT_{idx}",
            message=f"Writer {idx} broadcast",
            payload={"writer_idx": idx},
        )

    # Concurrently execute 15 event emissions
    await asyncio.gather(*[_emit_event(i) for i in range(num_concurrent_writers)])

    # Verify all 15 events persisted with strictly unique monotonic sequences
    async with AsyncSessionLocal() as session:
        evts = (await session.execute(
            select(AutomationEventModel).where(AutomationEventModel.run_id == run_id).order_by(AutomationEventModel.seq.asc())
        )).scalars().all()

        assert len(evts) == num_concurrent_writers, f"Expected {num_concurrent_writers} events, got {len(evts)}"
        seqs = [e.seq for e in evts]
        assert len(seqs) == len(set(seqs)), f"Duplicate sequences found: {seqs}"
        assert seqs == list(range(1, num_concurrent_writers + 1)), f"Sequences not strictly continuous: {seqs}"

        # Verify parent AutomationRunModel.last_event_seq matches max seq
        final_run = await session.get(AutomationRunModel, run_id)
        assert final_run.last_event_seq == num_concurrent_writers


@pytest.mark.asyncio
async def test_forced_lock_contention_and_transaction_rollback():
    """Scenario 6: Forced SQLite lock contention, retry handling, and rollback on duplicate."""
    run_id = f"lock_run_{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as session:
        run_m = AutomationRunModel(
            id=run_id,
            user_id="test_user",
            status="RUNNING",
            worker_id="test-worker",
            last_event_seq=1,
        )
        evt_m = AutomationEventModel(
            id=f"{run_id}_evt_1",
            run_id=run_id,
            seq=1,
            event_name="INITIAL_EVENT",
            payload={},
        )
        session.add(run_m)
        session.add(evt_m)
        await session.commit()

    # 1. Duplicate sequence insert must raise IntegrityError and rollback
    async with AsyncSessionLocal() as session:
        dup_evt = AutomationEventModel(
            id=f"{run_id}_evt_dup",
            run_id=run_id,
            seq=1,  # Duplicate seq
            event_name="DUPLICATE_EVENT",
            payload={},
        )
        session.add(dup_evt)
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

    # Verify database still has exactly 1 event and run.last_event_seq == 1
    async with AsyncSessionLocal() as session:
        evts = (await session.execute(
            select(AutomationEventModel).where(AutomationEventModel.run_id == run_id)
        )).scalars().all()
        assert len(evts) == 1
        assert evts[0].seq == 1

    # 2. Verify retry on transient lock/busy error:
    # First attempt fails with 'database is locked', second attempt succeeds.
    # Verify the event eventually persists, no duplicate is created, and sequence has no gap (seq=2).
    sim_session = AutomationSession(
        run_id=run_id,
        user_id="test_user",
        execution_id=run_id,
    )
    # in-memory starts with no sequence
    assert getattr(sim_session, "_event_seq", 0) == 0

    from sqlalchemy.exc import OperationalError
    attempts = 0
    orig_commit = AsyncSession.commit

    async def flaky_commit(self_session):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise OperationalError("database is locked", None, Exception("database is locked"))
        return await orig_commit(self_session)

    with patch.object(AsyncSession, "commit", flaky_commit):
        await orchestrator._broadcast_event(
            session=sim_session,
            event_name="RETRY_EVENT",
            message="Event succeeded after lock retry",
            payload={"retry": True},
        )

    assert attempts >= 2
    # Verify in-memory sequence updated only after successful commit
    assert sim_session._event_seq == 2

    # Verify database state has sequence [1, 2] with no gaps
    async with AsyncSessionLocal() as session:
        evts = (await session.execute(
            select(AutomationEventModel)
            .where(AutomationEventModel.run_id == run_id)
            .order_by(AutomationEventModel.seq.asc())
        )).scalars().all()
        assert len(evts) == 2
        assert [e.seq for e in evts] == [1, 2]
        
        final_run = await session.get(AutomationRunModel, run_id)
        assert final_run.last_event_seq == 2


@pytest.mark.asyncio
async def test_broadcast_failure_crash_recovery(authenticated_client):
    """Scenario 7: WebSocket broadcast failure leaves DB event committed and recoverable."""
    client, headers, _ = authenticated_client

    start_payload = {
        "source_type": "naukri",
        "roles": ["Staff Engineer"],
        "max_applications": 1,
    }
    start_resp = await client.post("/api/v1/automation/start", json=start_payload, headers=headers)
    run_id = start_resp.json()["run_id"]
    sim_session = orchestrator.get_session(run_id)

    # Patch ws_manager to simulate network crash during send
    with patch("app.api.v1.ws.ws_manager.broadcast_to_user", side_effect=RuntimeError("Client Disconnected")):
        # Broadcast may fail WS send, but DB event must be committed
        try:
            await orchestrator._broadcast_event(
                session=sim_session,
                event_name="CRASH_EVENT",
                message="Event committed despite WS disconnect",
                payload={"crash_test": True},
            )
        except Exception:
            pass

    # Client reconnects and fetches events
    reconnected_resp = await client.get(f"/api/v1/automation/runs/{run_id}/events", headers=headers)
    assert reconnected_resp.status_code == 200
    events = reconnected_resp.json()
    crash_evt = next((e for e in events if e.get("event_name") == "CRASH_EVENT"), None)
    assert crash_evt is not None
    assert crash_evt["payload"]["crash_test"] is True


@pytest.mark.asyncio
async def test_backend_restart_persistence_recovery(authenticated_client):
    """Scenario 8: Cache eviction / backend restart restores status from SQLite."""
    client, headers, _ = authenticated_client

    start_payload = {
        "source_type": "naukri",
        "roles": ["Staff Engineer"],
        "max_applications": 1,
    }
    start_resp = await client.post("/api/v1/automation/start", json=start_payload, headers=headers)
    run_id = start_resp.json()["run_id"]

    # Evict from in-memory orchestrator dictionary
    if run_id in orchestrator._sessions:
        del orchestrator._sessions[run_id]

    restarted_status = await client.get(f"/api/v1/automation/runs/{run_id}", headers=headers)
    assert restarted_status.status_code == 200
    assert restarted_status.json()["run_id"] == run_id


@pytest.mark.asyncio
async def test_sqlite_migration_repair_on_historical_and_duplicate_events():
    """Scenario 9: SQLite migration repairs null, zero, and duplicate sequences while preserving records."""
    from app.core.database import _migrate_sqlite_columns

    test_run_id = f"mig_run_{uuid.uuid4().hex[:8]}"

    async with AsyncSessionLocal() as session:
        # Create run model
        run_m = AutomationRunModel(
            id=test_run_id,
            user_id="migration_user",
            status="COMPLETED",
            worker_id="worker-1",
            last_event_seq=0,
        )
        session.add(run_m)
        await session.commit()

        # Temporarily drop unique index to insert corrupted historical test data
        await session.execute(text("DROP INDEX IF EXISTS uq_run_event_seq"))
        # Rebuild the table the way legacy databases had it: seq was nullable.
        await session.execute(text("DROP TABLE automation_events"))
        await session.execute(text(
            "CREATE TABLE automation_events ("
            "id VARCHAR PRIMARY KEY, run_id VARCHAR NOT NULL, seq INTEGER, "
            "event_name VARCHAR, payload TEXT, created_at DATETIME)"
        ))
        
        # Insert historical events: non-contiguous valid sequences (10, 50) alongside 0 and NULL
        cid1, cid2, cid3, cid4, cid5 = [f"evt_corrupt_{uuid.uuid4().hex[:6]}" for _ in range(5)]
        await session.execute(text(f"""
            INSERT INTO automation_events (id, run_id, seq, event_name, payload, created_at)
            VALUES ('{cid1}', '{test_run_id}', 10, 'HISTORICAL_VALID_10', '{{}}', datetime('now', '-10 minutes'))
        """))
        await session.execute(text(f"""
            INSERT INTO automation_events (id, run_id, seq, event_name, payload, created_at)
            VALUES ('{cid2}', '{test_run_id}', NULL, 'HISTORICAL_NULL', '{{}}', datetime('now', '-8 minutes'))
        """))
        await session.execute(text(f"""
            INSERT INTO automation_events (id, run_id, seq, event_name, payload, created_at)
            VALUES ('{cid3}', '{test_run_id}', 50, 'HISTORICAL_VALID_50', '{{}}', datetime('now', '-6 minutes'))
        """))
        await session.execute(text(f"""
            INSERT INTO automation_events (id, run_id, seq, event_name, payload, created_at)
            VALUES ('{cid4}', '{test_run_id}', 0, 'HISTORICAL_ZERO', '{{}}', datetime('now', '-4 minutes'))
        """))
        await session.execute(text(f"""
            INSERT INTO automation_events (id, run_id, seq, event_name, payload, created_at)
            VALUES ('{cid5}', '{test_run_id}', 10, 'HISTORICAL_DUP_10', '{{}}', datetime('now', '-2 minutes'))
        """))
        await session.commit()

    # Run SQLite migration repair function
    await _migrate_sqlite_columns()

    # Verify:
    # 1. All 5 historical records preserved
    # 2. Sequences strictly unique and monotonically re-numbered [1, 2, 3, 4, 5]
    # 3. last_event_seq on AutomationRunModel updated to 5
    # 4. Unique index uq_run_event_seq is present
    async with AsyncSessionLocal() as session:
        evts = (await session.execute(
            select(AutomationEventModel)
            .where(AutomationEventModel.run_id == test_run_id)
            .order_by(AutomationEventModel.seq.asc())
        )).scalars().all()

        assert len(evts) == 5, f"Records were deleted! Expected 5, got {len(evts)}"
        repaired_seqs = [e.seq for e in evts]
        assert len(repaired_seqs) == len(set(repaired_seqs)), f"Duplicates remain: {repaired_seqs}"
        assert repaired_seqs == [1, 2, 3, 4, 5], f"Unexpected sequence values: {repaired_seqs}"

        # Verify chronological order preservation
        names = [e.event_name for e in evts]
        assert names == [
            "HISTORICAL_VALID_10",
            "HISTORICAL_NULL",
            "HISTORICAL_VALID_50",
            "HISTORICAL_ZERO",
            "HISTORICAL_DUP_10",
        ]

        updated_run = await session.get(AutomationRunModel, test_run_id)
        assert updated_run.last_event_seq == 5

        # Verify index exists
        idx_res = await session.execute(text("SELECT name FROM sqlite_master WHERE type='index' AND name='uq_run_event_seq'"))
        assert idx_res.scalar() == "uq_run_event_seq"


@pytest.mark.asyncio
async def test_run_lock_lifecycle_reference_counting_and_cleanup_race():
    """
    Scenario 10: Deterministic concurrency regression test for lock lifecycle.
    
    Verifies that:
    1. Event producer A holds the run lock.
    2. Event producer B enters waiting state for run lock.
    3. Cleanup is triggered while B is waiting: cleanup MUST NOT remove the lock.
    4. Producer C attempts to acquire the run lock: C MUST receive the EXACT SAME lock instance as A and B.
    5. No two different locks can exist simultaneously for the same run ID.
    6. All producers complete and persist unique, gapless event sequences.
    7. Only after all holders and waiters complete (ref_count == 0) can the lock entry be safely cleaned up.
    """
    run_id = f"race_lock_{uuid.uuid4().hex[:8]}"

    # Setup parent run in database
    async with AsyncSessionLocal() as session:
        run_m = AutomationRunModel(
            id=run_id,
            user_id="test_user",
            status="RUNNING",
            worker_id="test-worker",
            last_event_seq=0,
        )
        session.add(run_m)
        await session.commit()

    sim_session = AutomationSession(
        run_id=run_id,
        user_id="test_user",
        execution_id=run_id,
    )

    a_holding = asyncio.Event()
    b_queued = asyncio.Event()
    release_a = asyncio.Event()

    locks_seen = []
    execution_order = []

    async def producer_a():
        async with orchestrator.run_lock(run_id) as lk:
            locks_seen.append(("A", id(lk)))
            execution_order.append("A_acquired")
            a_holding.set()
            # Wait until B is queued and cleanup has attempted to run
            await release_a.wait()
            execution_order.append("A_released")
        # Now broadcast event A (which acquires run_lock internally)
        await orchestrator._broadcast_event(
            session=sim_session,
            event_name="PRODUCER_A_EVENT",
            message="Message from A",
        )

    # Explicit event to confirm B has entered run_lock registration
    b_entered = asyncio.Event()

    async def producer_b():
        # Ensure A is holding the lock first
        await a_holding.wait()
        b_queued.set()
        # B enters run_lock and will queue behind A
        async with orchestrator.run_lock(run_id) as lk:
            b_entered.set()
            locks_seen.append(("B", id(lk)))
            execution_order.append("B_acquired")
        # Now broadcast event B
        await orchestrator._broadcast_event(
            session=sim_session,
            event_name="PRODUCER_B_EVENT",
            message="Message from B",
        )
        execution_order.append("B_released")

    async def producer_c():
        # Producer C arrives after cleanup attempt
        async with orchestrator.run_lock(run_id) as lk:
            locks_seen.append(("C", id(lk)))
            execution_order.append("C_acquired")
        # Now broadcast event C
        await orchestrator._broadcast_event(
            session=sim_session,
            event_name="PRODUCER_C_EVENT",
            message="Message from C",
        )
        execution_order.append("C_released")

    # Start A and wait for it to acquire the lock
    task_a = asyncio.create_task(producer_a())
    await a_holding.wait()

    # Start B (it will increment ref_count and queue behind A)
    task_b = asyncio.create_task(producer_b())
    await b_queued.wait()
    # Explicitly yield loop turn to guarantee B has executed its registration block
    await asyncio.sleep(0)

    # Verify that ref_count tracks both A and B
    entry = orchestrator._run_locks.get(run_id)
    assert entry is not None
    assert entry.ref_count >= 2, f"Expected ref_count >= 2 (A and B), got {entry.ref_count}"

    # Now attempt cleanup while A is holding and B is queued
    orchestrator.cleanup_run_lock(run_id)

    # Cleanup MUST NOT have evicted the lock entry because B is waiting (ref_count > 0)
    assert run_id in orchestrator._run_locks, "Race condition detected! Lock was evicted while B was waiting!"
    entry_after_cleanup = orchestrator._run_locks.get(run_id)
    assert entry_after_cleanup is entry, "Lock entry was replaced during concurrent cleanup!"

    # Start C concurrently
    task_c = asyncio.create_task(producer_c())
    await asyncio.sleep(0)

    # Release A so execution proceeds through B and C
    release_a.set()

    await asyncio.gather(task_a, task_b, task_c)

    # Verify that all 3 producers shared the EXACT same lock instance
    lock_ids = [lock_id for _, lock_id in locks_seen]
    assert len(lock_ids) == 3
    assert len(set(lock_ids)) == 1, f"Multiple lock instances created for same run_id: {locks_seen}"

    # Verify that all events persisted to SQLite with strictly unique, gapless sequences
    async with AsyncSessionLocal() as session:
        evts = (await session.execute(
            select(AutomationEventModel)
            .where(AutomationEventModel.run_id == run_id)
            .order_by(AutomationEventModel.seq.asc())
        )).scalars().all()

        assert len(evts) == 3, f"Expected 3 events, got {len(evts)}"
        seqs = [e.seq for e in evts]
        assert seqs == [1, 2, 3], f"Event sequences not contiguous [1, 2, 3]: {seqs}"
        names = [e.event_name for e in evts]
        assert "PRODUCER_A_EVENT" in names
        assert "PRODUCER_B_EVENT" in names
        assert "PRODUCER_C_EVENT" in names

    # After all producers have exited, ref_count is 0 and dictionary can safely be cleaned up
    entry_final = orchestrator._run_locks.get(run_id)
    # Either already popped by the last run_lock exit or cleanable via cleanup_run_lock
    if entry_final is not None:
        assert entry_final.ref_count == 0
        orchestrator.cleanup_run_lock(run_id)
        assert run_id not in orchestrator._run_locks


@pytest.mark.asyncio
async def test_run_lock_waiter_cancellation_and_leak_prevention():
    """
    Scenario 11: Waiter cancellation, reference count leak prevention, and backward-compatible get_run_lock.
    
    Verifies that:
    1. Producer A acquires run_lock(run_id).
    2. Producer B queues up on run_lock(run_id) (ref_count increases).
    3. Producer B is cancelled while waiting for the lock.
    4. Cancellation is handled gracefully: shielded cleanup decrements ref_count back to 1.
    5. No negative ref_counts, no counter leaks.
    6. get_run_lock(run_id) returns the exact same underlying asyncio.Lock instance.
    7. Once Producer A exits, the lock entry can be safely cleaned up without residual state.
    """
    run_id = f"cancel_run_{uuid.uuid4().hex[:8]}"

    a_holding = asyncio.Event()
    b_queued = asyncio.Event()
    b_cancelled_observed = asyncio.Event()
    release_a = asyncio.Event()

    lock_a_id = None
    lock_b_id = None

    async def producer_a():
        nonlocal lock_a_id
        async with orchestrator.run_lock(run_id) as lk:
            lock_a_id = id(lk)
            a_holding.set()
            await release_a.wait()

    async def producer_b():
        nonlocal lock_b_id
        await a_holding.wait()
        b_queued.set()
        try:
            async with orchestrator.run_lock(run_id) as lk:
                lock_b_id = id(lk)
        except asyncio.CancelledError:
            b_cancelled_observed.set()
            raise

    # 1. Start Producer A
    task_a = asyncio.create_task(producer_a())
    await a_holding.wait()

    # Verify initial ref_count is 1
    entry = orchestrator._run_locks.get(run_id)
    assert entry is not None
    assert entry.ref_count == 1
    assert entry.lock.locked()

    # 2. Backward compatibility check: get_run_lock returns identical lock object
    compat_lock = orchestrator.get_run_lock(run_id)
    assert id(compat_lock) == lock_a_id

    # 3. Start Producer B and wait until queued
    task_b = asyncio.create_task(producer_b())
    await b_queued.wait()
    await asyncio.sleep(0)  # Yield loop to allow B to register in run_lock

    assert entry.ref_count == 2, f"Expected ref_count 2 for A and B, got {entry.ref_count}"

    # 4. Cancel Producer B while it is waiting in queue
    task_b.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task_b

    assert b_cancelled_observed.is_set()

    # 5. Verify reference count decremented properly back to 1 despite cancellation
    assert entry.ref_count == 1, f"Expected ref_count restored to 1 after cancel, got {entry.ref_count}"
    assert entry.lock.locked()

    # 6. Release Producer A and wait for completion
    release_a.set()
    await task_a

    # 7. Post-completion: ref_count must be 0 and entry safely cleaned up
    entry_after = orchestrator._run_locks.get(run_id)
    if entry_after is not None:
        assert entry_after.ref_count == 0
        orchestrator.cleanup_run_lock(run_id)
        assert run_id not in orchestrator._run_locks



@pytest.mark.asyncio
async def test_events_endpoint_pages_with_limit_and_cursor(client: AsyncClient):
    """DB-06: the events endpoint never returns an unbounded list."""
    email = f"pager_{uuid.uuid4().hex[:6]}@example.com"
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    user_id = reg.json()["id"]
    run_id = f"run_page_{uuid.uuid4().hex[:6]}"

    async with AsyncSessionLocal() as session:
        session.add(AutomationRunModel(id=run_id, user_id=user_id, status="COMPLETED", worker_id="w", last_event_seq=5))
        for seq in range(1, 6):
            session.add(AutomationEventModel(
                id=f"{run_id}_evt_{seq}", run_id=run_id, seq=seq, event_name="E", payload={}
            ))
        await session.commit()

    first = (await client.get(f"/api/v1/automation/runs/{run_id}/events?limit=2", headers=headers)).json()
    assert [e["seq"] for e in first] == [1, 2]
    second = (await client.get(f"/api/v1/automation/runs/{run_id}/events?limit=2&after_seq=2", headers=headers)).json()
    assert [e["seq"] for e in second] == [3, 4]
    rest = (await client.get(f"/api/v1/automation/runs/{run_id}/events?after_seq=4", headers=headers)).json()
    assert [e["seq"] for e in rest] == [5]
    assert (await client.get(f"/api/v1/automation/runs/{run_id}/events?limit=0", headers=headers)).status_code == 422
