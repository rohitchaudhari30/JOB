"""IMP-054: object-level authorization probe (BOLA/IDOR) + anonymous access sweep.

Two sweeps over the real route table (read from the OpenAPI spec, so a new route is
covered, or fails the "classify it" check, instead of being silently missed):

1. Anonymous: every operation except the explicit public list answers 401.
2. Second user: every operation with an id in its path, called with user B's token
   against user A's real record, answers 403/404, returns none of A's data, and leaves
   A's record untouched. A control call as A must succeed first, so a 404 for B can't
   be an artefact of a bad fixture, and 422/5xx count as inconclusive failures.
"""
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.models import (
    ApplicationModel,
    AutomationRunModel,
    CampaignExecutionModel,
    CampaignModel,
    JobModel,
    JobSourceModel,
    ResumeModel,
    TailoredResumeModel,
)
from main import app

PASSWORD = "Password123!"
BROWSER_ENTRY_POINTS = (
    "_start_playwright_instance", "initialize", "get_browser", "_create_context_internal",
    "_create_headed_context_internal", "_create_headed_session_internal", "create_context",
    "create_authenticated_context", "create_isolated_context",
)
browser_launch_attempts: list[str] = []


@pytest.fixture(autouse=True)
def no_external_side_effects(monkeypatch):
    """The probe calls action routes (start, launch, approve, execute...) as the record's real owner, so
    those handlers run for real. Nothing may leave the process: every browser entry point is blocked
    and the AI provider keys are blanked, so no job site or paid API can be reached from this file."""
    from app.core.config import settings
    from app.infrastructure.browser.browser_manager import PlaywrightBrowserManager

    browser_launch_attempts.clear()

    def blocker(name):
        async def _blocked(self, *a, **kw):
            browser_launch_attempts.append(name)
            raise RuntimeError(f"browser blocked in access-control probe ({name})")
        return _blocked

    for name in BROWSER_ENTRY_POINTS:
        monkeypatch.setattr(PlaywrightBrowserManager, name, blocker(name))
    for key in ("GROQ_API_KEY", "GEMINI_API_KEY"):
        monkeypatch.setattr(settings, key, "")
MARK = "ZZ-ALICE-PRIVATE-MARKER"

# No login required.
PUBLIC = {
    ("GET", "/"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/register"),
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/health/ready"),
}

# Path params that are not per-user record ids, with the reason they are not part of sweep 2.
NOT_USER_RECORD_PARAMS = {
    "platform": "a fixed platform name; connections are looked up by the caller's own user_id",
    "job_id": "jobs are a shared discovered-jobs catalog, not owned per user (checked separately below)",
}


def operations():
    spec = app.openapi()
    for path, ops in sorted(spec["paths"].items()):
        for method, op in ops.items():
            if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}:
                yield method.upper(), path, op


async def _signup(client: AsyncClient, email: str) -> dict:
    res = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "full_name": "T"})
    assert res.status_code == 201, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.mark.asyncio
async def test_every_non_public_operation_rejects_anonymous_callers(client: AsyncClient):
    checked, failures = 0, []
    for method, path, _ in operations():
        if (method, path) in PUBLIC:
            continue
        url = path
        for seg in path.split("/"):
            if seg.startswith("{"):
                url = url.replace(seg, "nonexistent-id")
        res = await client.request(method, url, json={} if method in {"POST", "PUT", "PATCH"} else None)
        checked += 1
        if res.status_code not in (401, 403):
            failures.append((method, path, res.status_code))
    assert checked > 60, "route table unexpectedly small; is the probe reading the spec?"
    assert failures == [], f"operations that answered an anonymous caller: {failures}"


CAMPAIGN_BODY = {
    "name": "Alice campaign " + MARK,
    "description": "private",
    "rule": {
        "auto_apply_threshold": 82.0,
        "review_threshold": 68.0,
        "min_experience_years": 1.0,
        "max_experience_years": 8.0,
        "target_roles": ["Backend Engineer"],
        "target_locations": ["Remote"],
        "mandatory_skills": ["Python"],
        "excluded_keywords": [],
        "target_platforms": ["naukri"],
    },
    "safety_policy": {
        "daily_application_limit": 15,
        "hourly_application_limit": 4,
        "cooldown_seconds": 60,
        "operating_start_time": "08:00",
        "operating_end_time": "20:00",
        "max_concurrent_applications": 1,
    },
    "schedule": {"is_active": False, "interval_minutes": 180},
}

# Minimal valid bodies, so a route is judged on authorization rather than rejected as a bad request.
BODIES = {
    ("POST", "/api/v1/applications/{application_id}/approve"): {"approve": True},
    ("POST", "/api/v1/applications/{application_id}/reconcile"): {"action": "DISMISS", "notes": "intruder"},
    ("POST", "/api/v1/applications/{application_id}/stop"): {"reason": "intruder"},
    ("PUT", "/api/v1/campaigns/{campaign_id}"): CAMPAIGN_BODY | {"name": "HIJACKED"},
    ("POST", "/api/v1/automation/runs/{run_id}/stop"): {"reason": "intruder"},
    ("PATCH", "/api/v1/resumes/{resume_id}/default"): {},
    ("POST", "/api/v1/tailored-resumes/{tailored_id}/answers"): {"answers": [{"question_id": "r1", "has_it": False}]},
    ("POST", "/api/v1/tailored-resumes/{tailored_id}/generate"): {"approved_edit_ids": ["e1"]},
    ("PUT", "/api/v1/applications/{application_id}/resume-choice"): {"use_tailored": False},
}


async def make_users(client: AsyncClient) -> dict:
    headers_a = await _signup(client, f"alice-{uuid.uuid4().hex[:6]}@example.com")
    headers_b = await _signup(client, f"bob-{uuid.uuid4().hex[:6]}@example.com")
    me = (await client.get("/api/v1/auth/me", headers=headers_a)).json()
    return {"a": headers_a, "b": headers_b, "user_a": me["id"]}


async def seed_a(client: AsyncClient, db_session: AsyncSession, monkeypatch, tmp_path, users: dict) -> dict:
    """A fresh set of records owned by user A (user B owns nothing). Returns their ids."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path))
    headers_a, user_a = users["a"], users["user_a"]

    res = await client.put(
        "/api/v1/profile",
        json={"headline": MARK, "experiences": [{"company_name": "AliceCo", "title": "Eng", "is_current": True}]},
        headers=headers_a,
    )
    assert res.status_code == 200, res.text
    edu = await client.post(
        "/api/v1/profile/educations", json={"institution": "AliceU", "degree": "BSc"}, headers=headers_a
    )
    assert edu.status_code == 201, edu.text
    profile = (await client.get("/api/v1/profile", headers=headers_a)).json()

    files = {"file": ("alice-cv.pdf", b"%PDF-" + b"x" * 100, "application/pdf")}
    resume = await client.post("/api/v1/resumes", files=files, headers=headers_a)
    assert resume.status_code == 201, resume.text

    camp = await client.post("/api/v1/campaigns", json=CAMPAIGN_BODY, headers=headers_a)
    assert camp.status_code == 201, camp.text
    campaign_id = camp.json()["id"]

    # The scheduler is a process-wide singleton bound to the first test's event loop, so register A's
    # schedule in its in-memory table directly (undone by monkeypatch) instead of via the API.
    from app.workers.scheduler_worker import ScheduleJobConfig, scheduler_worker

    schedule_id = f"sched_{uuid.uuid4().hex[:8]}"
    monkeypatch.setitem(
        scheduler_worker._configs,
        schedule_id,
        ScheduleJobConfig(schedule_id=schedule_id, user_id=user_a, source_type="naukri", roles=["X"],
                          locations=["Y"], interval_minutes=120, auto_apply=False, max_applications_per_run=1,
                          created_at=datetime.now(timezone.utc)),
    )

    (tmp_path / "screenshots").mkdir(exist_ok=True)
    shot = f"alice-{uuid.uuid4().hex[:6]}.png"
    (tmp_path / "screenshots" / shot).write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 32)

    if not await db_session.get(JobSourceModel, "naukri"):
        db_session.add(JobSourceModel(id="naukri", source_type="naukri", base_url="https://www.naukri.com", is_active=True))
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    db_session.add(JobModel(id=job_id, source_id="naukri", external_job_id=f"e_{uuid.uuid4().hex[:6]}", title="Role",
                            company="Co", location="Remote", apply_url="https://example.com/j", raw_description="d", is_active=True))
    app_id = f"app_{uuid.uuid4().hex[:10]}"
    db_session.add(ApplicationModel(id=app_id, user_id=user_a, job_id=job_id, idempotency_key=f"idem_{uuid.uuid4().hex[:8]}",
                                    workflow_state="RECONCILIATION_REQUIRED", outcome_status="NOT_SUBMITTED", retry_count=0,
                                    screenshot_file_path=f"screenshots/{shot}"))
    run_id = f"run_{uuid.uuid4().hex[:10]}"
    # The database allows one live run per user, so retire the one an earlier route left behind.
    await db_session.execute(
        update(AutomationRunModel)
        .where(AutomationRunModel.user_id == user_a, AutomationRunModel.status.in_(("STARTING", "RUNNING", "PAUSED")))
        .values(status="COMPLETED")
    )
    db_session.add(AutomationRunModel(id=run_id, user_id=user_a, status="RUNNING"))
    # The run routes act on the in-memory session (not the DB row), so give A a live one.
    from app.application.automation.orchestrator import AutomationSession, orchestrator
    from app.domain.automation.state_machine import AutomationState

    live = AutomationSession(run_id=run_id, user_id=user_a)
    live.transition_to(AutomationState.RUNNING)
    monkeypatch.setitem(orchestrator._sessions, run_id, live)
    exec_id = f"cexec_{uuid.uuid4().hex[:10]}"
    db_session.add(CampaignExecutionModel(id=exec_id, campaign_id=campaign_id, user_id=user_a, status="RUNNING",
                                          started_at=datetime.now(timezone.utc)))
    # A's job-specific resume copy: a real Word file on disk plus its row, ready for review.
    from tests.support.resume_docs import make_resume

    tailored_dir = tmp_path / "tailored_resumes" / user_a
    tailored_dir.mkdir(parents=True, exist_ok=True)
    tailored_file = make_resume(tailored_dir / f"{uuid.uuid4().hex}.docx")
    tailored_id = f"tail_{uuid.uuid4().hex[:10]}"
    db_session.add(TailoredResumeModel(
        id=tailored_id, user_id=user_a, master_resume_id=resume.json()["id"], master_file_hash="0" * 64, job_id=job_id,
        job_description_hash="0" * 64, input_hash=uuid.uuid4().hex, status="READY_FOR_REVIEW", mode="EDIT",
        edit_plan={"edits": [{"id": "e1"}]}, validation={"passed": True}, file_path=str(tailored_file),
        file_name="alice-tailored.docx", company_snapshot="Co", job_title_snapshot="Role",
    ))
    await db_session.commit()

    return {
        "tailored_id": tailored_id,
        "application_id": app_id,
        "campaign_id": campaign_id,
        "execution_id": exec_id,
        "run_id": run_id,
        "schedule_id": schedule_id,
        "resume_id": resume.json()["id"],
        "exp_id": profile["experiences"][0]["id"],
        "edu_id": profile["educations"][0]["id"],
    }


async def fingerprint(db: AsyncSession, client: AsyncClient, headers_a: dict, ids: dict) -> dict:
    """What A owns right now: existence and the fields B might try to change."""
    from app.workers.scheduler_worker import scheduler_worker

    db.expire_all()
    app_row = await db.get(ApplicationModel, ids["application_id"])
    camp = await db.get(CampaignModel, ids["campaign_id"])
    run = await db.get(AutomationRunModel, ids["run_id"])
    ex = await db.get(CampaignExecutionModel, ids["execution_id"])
    from app.application.automation.orchestrator import orchestrator

    live = orchestrator._sessions.get(ids["run_id"])
    profile = (await client.get("/api/v1/profile", headers=headers_a)).json()
    return {
        "application": app_row and (app_row.workflow_state, app_row.outcome_status, app_row.retry_count),
        "campaign": camp and (camp.name, camp.state),
        "run": run and run.status,
        "live_session": live and (live.status.value, live.is_paused, live.cancel_requested),
        "execution": ex and ex.status,
        "tailored": (await db.get(TailoredResumeModel, ids["tailored_id"])) and (await db.get(TailoredResumeModel, ids["tailored_id"])).status,
        "resume": (await db.get(ResumeModel, ids["resume_id"])) is not None and None or bool(await db.get(ResumeModel, ids["resume_id"])),
        "schedule": ids["schedule_id"] in scheduler_worker._configs,
        "experiences": sorted(e["id"] for e in profile["experiences"]),
        "educations": sorted(e["id"] for e in profile["educations"]),
        "skills": len(profile.get("skills", [])),
    }


def _fill(path: str, ids: dict) -> str:
    for name, value in ids.items():
        path = path.replace("{" + name + "}", value)
    return path


@pytest.mark.asyncio
async def test_every_id_route_is_classified():
    """A new route with an id in its path must be added to the sweep (or explained), never silently skipped."""
    import re

    known = {"application_id", "campaign_id", "execution_id", "run_id", "schedule_id", "resume_id", "exp_id", "edu_id", "tailored_id"}
    unclassified = []
    for method, path, _ in operations():
        for param in re.findall(r"{(\w+)}", path):
            if param not in known and param not in NOT_USER_RECORD_PARAMS:
                unclassified.append((method, path, param))
    assert unclassified == [], f"classify these in the access-control probe: {unclassified}"


@pytest.mark.asyncio
async def test_user_b_cannot_read_or_change_user_a_records(client: AsyncClient, db_session: AsyncSession, monkeypatch, tmp_path):
    import re

    users = await make_users(client)
    a, b = users["a"], users["b"]
    inconclusive, leaked, vacuous, changed, matrix, swept = [], [], [], [], [], 0

    for method, template, _ in operations():
        params = re.findall(r"{(\w+)}", template)
        known = {"application_id", "campaign_id", "execution_id", "run_id", "schedule_id", "resume_id", "exp_id", "edu_id", "tailored_id"}
        if not params or any(p not in known for p in params):
            continue
        ids = await seed_a(client, db_session, monkeypatch, tmp_path, users)  # fresh records for every route
        url = _fill(template, ids)
        body = BODIES.get((method, template), {} if method in {"POST", "PUT", "PATCH"} else None)

        before = await fingerprint(db_session, client, a, ids)
        res_b = await client.request(method, url, json=body, headers=b)
        after = await fingerprint(db_session, client, a, ids)
        swept += 1
        if before != after:
            changed.append((method, template, "A's records changed by B's request"))
        if res_b.status_code not in (403, 404):
            (inconclusive if res_b.status_code in (400, 405, 409, 422) or res_b.status_code >= 500 else leaked).append(
                (method, template, res_b.status_code)
            )
        if MARK in res_b.text or "AliceCo" in res_b.text or "AliceU" in res_b.text:
            leaked.append((method, template, "A's data in B's response"))

        # Control: the very same request as A must reach the handler. A 404/403 for A as well would mean B's
        # 404 says nothing about authorization (bad fixture, wrong state), so that is a failure of the probe.
        res_a = await client.request(method, url, json=body, headers=a)
        if res_a.status_code in (401, 403, 404) or res_a.status_code >= 500:
            vacuous.append((method, template, res_a.status_code))
        matrix.append((method, template, res_b.status_code, res_a.status_code))

    print("\nmethod path  B  A")
    for row in matrix:
        print(*row)
    print("changed:", changed, "\nleaked:", leaked, "\nvacuous:", vacuous, "\ninconclusive:", inconclusive)
    assert swept >= 25, f"only {swept} id routes swept; is the probe reading the spec?"
    assert changed == [], f"user B changed user A's data: {changed}"
    assert leaked == [], f"user B reached user A's data: {leaked}"
    assert vacuous == [], f"A's own request did not reach the handler, so B's result proves nothing: {vacuous}"
    assert inconclusive == [], f"probe could not decide (bad body / server error): {inconclusive}"


@pytest.mark.asyncio
async def test_the_probe_cannot_launch_a_browser_or_reach_a_site():
    from app.infrastructure.browser.browser_manager import browser_manager

    with pytest.raises(RuntimeError, match="blocked in access-control probe"):
        await browser_manager.create_context()
    with pytest.raises(RuntimeError, match="blocked in access-control probe"):
        await browser_manager.initialize()
