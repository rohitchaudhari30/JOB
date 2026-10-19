"""Q-03: /jobs/matches pages through all matches and reports the total, instead of silently stopping at 50."""
import uuid

import pytest

from app.infrastructure.database.models.models import JobModel, MatchResultModel


async def _user(client, email):
    reg = await client.post("/api/v1/auth/register", json={"email": email, "password": "Password123!"})
    return reg.json()["id"], {"Authorization": f"Bearer {reg.json()['access_token']}"}


async def _seed(db, user_id, n, decision_cycle=("AUTO_APPLY", "REQUIRE_APPROVAL", "REJECT")):
    for i in range(n):
        jid = f"j_{uuid.uuid4().hex[:8]}"
        db.add(JobModel(id=jid, source_id="naukri", external_job_id=f"e_{jid}", title=f"Role {i}", company="Co",
                        location="Remote", apply_url="https://example.com/j", raw_description="d", is_active=True))
        db.add(MatchResultModel(id=f"m_{jid}", user_id=user_id, job_id=jid, match_score=float(100 - i), overall_score=float(100 - i),
                                skill_match_score=1.0, semantic_score=1.0, decision=decision_cycle[i % len(decision_cycle)]))
    await db.commit()


@pytest.mark.asyncio
async def test_pages_cover_every_match_exactly_once_and_total_is_reported(client, db_session):
    uid, h = await _user(client, "pg1@example.com")
    await _seed(db_session, uid, 7)
    seen, total = [], None
    for skip in (0, 3, 6):
        r = await client.get("/api/v1/jobs/matches", headers=h, params={"skip": skip, "limit": 3})
        assert r.status_code == 200
        total = int(r.headers["X-Total-Count"])
        seen += [m["job_id"] for m in r.json()]
    assert total == 7
    assert len(seen) == 7 and len(set(seen)) == 7  # none repeated, none skipped
    scores = []
    for skip in (0, 3, 6):
        r = await client.get("/api/v1/jobs/matches", headers=h, params={"skip": skip, "limit": 3})
        scores += [m["match_score"] for m in r.json()]
    assert scores == sorted(scores, reverse=True)  # still best first across pages


@pytest.mark.asyncio
async def test_total_follows_the_filters_and_is_per_user(client, db_session):
    uid, h = await _user(client, "pg2@example.com")
    other, _ = await _user(client, "pg3@example.com")
    await _seed(db_session, uid, 9)
    await _seed(db_session, other, 4)
    r = await client.get("/api/v1/jobs/matches", headers=h, params={"decision": "AUTO_APPLY", "limit": 2})
    assert int(r.headers["X-Total-Count"]) == 3 and len(r.json()) == 2
    r = await client.get("/api/v1/jobs/matches", headers=h, params={"min_score": 95})
    assert int(r.headers["X-Total-Count"]) == 6 and len(r.json()) == 6  # scores 100..95
    r = await client.get("/api/v1/jobs/matches", headers=h)
    assert int(r.headers["X-Total-Count"]) == 9  # the other user's 4 are not counted
