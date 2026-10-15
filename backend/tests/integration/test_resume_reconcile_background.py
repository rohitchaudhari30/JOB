"""AUT-14: resume and reconcile must not hold a web request open while a browser runs."""
import asyncio
import uuid
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.applications.deferred import DeferredExecuteUseCase
from app.api.v1 import applications as applications_api
from tests.integration.test_phase3_reconciliation_authorization import (
    _make_reconciliation_app,
    _setup_test_environment,
)


@pytest.mark.asyncio
async def test_deferred_executor_commits_first_then_starts_and_returns_current_state():
    calls = []
    repo = AsyncMock()
    repo.get_by_id.return_value = "current-application"

    async def commit():
        calls.append("commit")

    deferred = DeferredExecuteUseCase(repo, commit=commit, start_in_background=lambda app_id: calls.append(f"start:{app_id}"))
    assert deferred.scheduled is False

    result = await deferred.execute(application_id="app-1")

    assert calls == ["commit", "start:app-1"]
    assert result == "current-application"
    assert deferred.scheduled is True


@pytest.mark.asyncio
async def test_resume_returns_202_and_starts_in_background(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    ctx = await _setup_test_environment(db_session)
    paused = _make_reconciliation_app(ctx["user_a_id"], ctx["job_id"], state="PAUSED_OTP")
    db_session.add(paused)
    await db_session.commit()

    started = []

    async def fake_background_run(application_id):
        started.append(application_id)

    monkeypatch.setattr(applications_api, "_execute_in_background", fake_background_run)

    response = await client.post(
        f"/api/v1/applications/{paused.id}/resume", json={"user_input": "123456"}, headers=ctx["headers_a"]
    )
    await asyncio.sleep(0.05)

    assert response.status_code == 202
    assert response.json()["workflow_state"] == "APPROVED"
    assert started == [paused.id]


@pytest.mark.asyncio
async def test_resume_in_wrong_state_does_not_start_anything(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    ctx = await _setup_test_environment(db_session)
    app = _make_reconciliation_app(ctx["user_a_id"], ctx["job_id"], state="APPLIED")
    db_session.add(app)
    await db_session.commit()

    started = []

    async def fake_background_run(application_id):
        started.append(application_id)

    monkeypatch.setattr(applications_api, "_execute_in_background", fake_background_run)

    response = await client.post(f"/api/v1/applications/{app.id}/resume", json={}, headers=ctx["headers_a"])
    await asyncio.sleep(0.05)

    assert response.status_code == 422
    assert started == []


@pytest.mark.asyncio
async def test_resume_cannot_be_started_by_another_user(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    ctx = await _setup_test_environment(db_session)
    paused = _make_reconciliation_app(ctx["user_a_id"], ctx["job_id"], state="PAUSED_OTP")
    db_session.add(paused)
    await db_session.commit()

    started = []

    async def fake_background_run(application_id):
        started.append(application_id)

    monkeypatch.setattr(applications_api, "_execute_in_background", fake_background_run)

    response = await client.post(f"/api/v1/applications/{paused.id}/resume", json={}, headers=ctx["headers_b"])
    await asyncio.sleep(0.05)

    assert response.status_code == 403
    assert started == []


@pytest.mark.asyncio
async def test_confirm_submitted_reconcile_finishes_in_the_request(client: AsyncClient, db_session: AsyncSession, monkeypatch):
    ctx = await _setup_test_environment(db_session)
    app = _make_reconciliation_app(ctx["user_a_id"], ctx["job_id"])
    db_session.add(app)
    await db_session.commit()

    started = []

    async def fake_background_run(application_id):
        started.append(application_id)

    monkeypatch.setattr(applications_api, "_execute_in_background", fake_background_run)

    response = await client.post(
        f"/api/v1/applications/{app.id}/reconcile",
        json={"action": "CONFIRM_SUBMITTED"},
        headers=ctx["headers_a"],
    )
    await asyncio.sleep(0.05)

    assert response.status_code == 200
    assert response.json()["workflow_state"] == "APPLIED"
    assert started == []
