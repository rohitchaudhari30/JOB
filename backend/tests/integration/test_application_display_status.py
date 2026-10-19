"""UX Phase 2: the API owns display_status / needs_attention and the stats count uses the same rule."""
import uuid

import pytest

from app.domain.applications.entities import WorkflowStateEnum
from app.infrastructure.database.models.models import ApplicationModel, JobModel


async def _user(client, email):
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    return reg.json()["id"], {"Authorization": f"Bearer {reg.json()['access_token']}"}


async def _seed(db, user_id, state, reason=None):
    jid = f"j_{uuid.uuid4().hex[:8]}"
    db.add(JobModel(id=jid, source_id="naukri", external_job_id=f"e_{jid}", title=f"Role {state}", company="Co",
                    location="Remote", apply_url="https://example.com/j", raw_description="d", is_active=True))
    db.add(ApplicationModel(id=f"a_{jid}", user_id=user_id, job_id=jid, idempotency_key=f"k_{jid}",
                            workflow_state=state, failure_reason=reason))
    await db.commit()
    return f"a_{jid}"


@pytest.mark.asyncio
async def test_list_and_detail_return_server_status_and_stats_use_the_same_rule(client, db_session):
    uid, h = await _user(client, "ds1@example.com")
    states = {
        "APPLIED": ("Applied", False),
        "FAILED": ("Failed", True),
        "PAUSED_OTP": ("Pending", True),
        "PAUSED_AUTH_EXPIRED": ("Pending", True),
        "PAUSED_SESSION": ("Pending", True),
        "SUBMISSION_UNKNOWN": ("Needs Verification", True),
        "RECONCILIATION_REQUIRED": ("Needs Verification", True),
        "APPROVAL_REQUIRED": ("Pending", False),
        "SKIPPED": ("Skipped", False),
    }
    ids = {}
    for state in states:
        ids[state] = await _seed(db_session, uid, state)

    r = await client.get("/api/v1/applications", headers=h, params={"limit": 50})
    assert r.status_code == 200
    by_state = {a["workflow_state"]: a for a in r.json()["items"]}
    for state, (label, attention) in states.items():
        assert by_state[state]["display_status"] == label, state
        assert by_state[state]["needs_attention"] is attention, state

    detail = await client.get(f"/api/v1/applications/{ids['PAUSED_AUTH_EXPIRED']}", headers=h)
    assert detail.status_code == 200
    assert detail.json()["needs_attention"] is True

    stats = (await client.get("/api/v1/applications/stats", headers=h)).json()
    expected = sum(1 for _, (_, attention) in states.items() if attention)
    assert stats["needs_attention"] == expected
    # Every row the list flags is counted by stats, and nothing else is.
    assert stats["needs_attention"] == sum(1 for a in r.json()["items"] if a["needs_attention"])


@pytest.mark.asyncio
async def test_failure_reason_refines_status_in_the_api(client, db_session):
    uid, h = await _user(client, "ds2@example.com")
    await _seed(db_session, uid, "FAILED", "Already applied on the portal")
    items = (await client.get("/api/v1/applications", headers=h)).json()["items"]
    assert items[0]["display_status"] == "Already applied"
    assert items[0]["workflow_state"] == "FAILED"
