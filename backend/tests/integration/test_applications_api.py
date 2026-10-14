import asyncio

import pytest
from httpx import AsyncClient
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_application_lifecycle_and_api_flow(client: AsyncClient, monkeypatch):
    # 1. Register & Login User
    user_payload = {
        "email": "candidate.apply@example.com",
        "password": "Password123!",
        "full_name": "Automation Tester",
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

    # 2. Setup Candidate Profile
    profile_payload = {
        "headline": "Senior Backend Engineer",
        "summary": "FastAPI and Python expert",
        "phone": "+919876543210",
        "location": "Bengaluru, India",
        "current_ctc": 2500000.0,
        "expected_ctc": 3500000.0,
        "currency": "INR",
        "notice_period_days": 30,
        "total_experience_months": 60,
        "work_authorization": "Citizen",
        "relocation_preference": True,
        "remote_preference": "any",
        "experiences": [
            {
                "company_name": "Tech Corp",
                "title": "Senior Backend Engineer",
                "location": "Bengaluru",
                "is_current": True,
            }
        ],
        "skills": [
            {"skill_name": "Python", "years_experience": 5.0, "is_primary": True},
            {"skill_name": "FastAPI", "years_experience": 4.0, "is_primary": True},
        ],
    }
    prof_resp = await client.put("/api/v1/profile", json=profile_payload, headers=headers)
    assert prof_resp.status_code == 200

    # 3. Create / Ingest a Job via Discovery endpoint with mock adapter
    from app.infrastructure.browser.adapters.registry import adapter_registry
    from tests.integration.test_jobs_api import MockBrowserManager, MockNaukriSourceAdapter
    from app.application.jobs import use_cases

    adapter_registry.register_source("mock_naukri", MockNaukriSourceAdapter)
    monkeypatch.setattr(use_cases, "browser_manager", MockBrowserManager())

    disc_resp = await client.post(
        "/api/v1/jobs/discover",
        json={"source_type": "mock_naukri", "roles": ["Data Engineer"], "locations": ["Bangalore"]},
        headers=headers,
    )
    assert disc_resp.status_code == 200
    job_id = disc_resp.json()["jobs"][0]["id"]

    # 4. Create Application record
    app_req = {"job_id": job_id}
    create_resp = await client.post("/api/v1/applications", json=app_req, headers=headers)
    assert create_resp.status_code == 201
    app_data = create_resp.json()
    assert app_data["job_id"] == job_id
    assert app_data["workflow_state"] == "APPROVED"
    app_id = app_data["id"]

    # 5. List Applications
    list_resp = await client.get("/api/v1/applications", headers=headers)
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert "items" in list_data
    assert list_data["total"] >= 1
    assert list_data["page"] == 1
    apps = list_data["items"]
    assert len(apps) >= 1
    assert any(a["id"] == app_id for a in apps)

    # 6. Get Application Stats
    stats_resp = await client.get("/api/v1/applications/stats", headers=headers)
    assert stats_resp.status_code == 200
    stats = stats_resp.json()
    assert stats["total"] >= 1

    # 7. Get Single Application Detail
    detail_resp = await client.get(f"/api/v1/applications/{app_id}", headers=headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["id"] == app_id

    # 8. Stop Application
    stop_resp = await client.post(
        f"/api/v1/applications/{app_id}/stop",
        json={"reason": "Testing manual abort"},
        headers=headers,
    )
    assert stop_resp.status_code == 200
    assert stop_resp.json()["workflow_state"] == "FAILED"

    # 9. Test Application Execution with Mocked Browser Context
    with patch("app.infrastructure.browser.browser_manager.browser_manager.create_isolated_context") as mock_create_ctx:
        mock_ctx = AsyncMock()
        mock_page = MagicMock()
        mock_page.goto = AsyncMock()
        mock_page.wait_for_timeout = AsyncMock()
        mock_page.is_closed = MagicMock(return_value=False)
        mock_page.screenshot = AsyncMock(return_value=b"fake_jpeg")
        mock_locator = MagicMock()
        mock_locator.first = mock_locator
        mock_locator.wait_for = AsyncMock()
        mock_locator.click = AsyncMock()
        mock_locator.fill = AsyncMock()
        mock_locator.type = AsyncMock()
        mock_locator.dispatch_event = AsyncMock()
        mock_page.locator.return_value = mock_locator
        mock_ctx.new_page.return_value = mock_page
        mock_ctx.close = AsyncMock()
        mock_create_ctx.return_value = mock_ctx

        with patch("app.infrastructure.browser.dom_analyzer.DOMAnalyzer.scan_form") as mock_scan:
            from app.infrastructure.browser.dom_analyzer import ScannedField, ScannedForm
            mock_scan.return_value = ScannedForm(
                fields=[
                    ScannedField(
                        field_id="f_0",
                        selector="#name",
                        tag_name="input",
                        input_type="text",
                        label_text="Full Name",
                    )
                ],
                submit_buttons=[
                    ScannedField(
                        field_id="b_0",
                        selector="#submit_btn",
                        tag_name="button",
                        input_type="submit",
                    )
                ],
                has_challenge=False,
            )

            # By default the run starts in the background and the request returns 202.
            from app.api.v1 import applications as applications_api

            started = []

            async def fake_background_run(application_id):
                started.append(application_id)

            monkeypatch.setattr(applications_api, "_execute_in_background", fake_background_run)
            bg_resp = await client.post(f"/api/v1/applications/{app_id}/execute", headers=headers)
            assert bg_resp.status_code == 202
            await asyncio.sleep(0.05)
            assert started == [app_id]

            exec_resp = await client.post(
                f"/api/v1/applications/{app_id}/execute?wait=true",
                headers=headers,
            )
            assert exec_resp.status_code == 200
            assert exec_resp.json()["workflow_state"] == "APPLIED"
            assert exec_resp.json()["applied_at"] is not None

    # 10. IDOR and Screenshot Endpoint Verification with Second User
    other_user = {
        "email": "intruder.user@example.com",
        "password": "Password123!",
        "full_name": "Intruder User",
    }
    await client.post("/api/v1/auth/register", json=other_user)
    other_login = await client.post(
        "/api/v1/auth/login",
        json={"email": other_user["email"], "password": other_user["password"]},
    )
    other_token = other_login.json()["access_token"]
    other_headers = {"Authorization": f"Bearer {other_token}"}

    # Verify IDOR blocked on GET
    idor_get = await client.get(f"/api/v1/applications/{app_id}", headers=other_headers)
    assert idor_get.status_code == 403

    # Verify IDOR blocked on actions
    idor_retry = await client.post(f"/api/v1/applications/{app_id}/retry", headers=other_headers)
    assert idor_retry.status_code == 403

    idor_stop = await client.post(
        f"/api/v1/applications/{app_id}/stop",
        json={"reason": "Malicious stop"},
        headers=other_headers,
    )
    assert idor_stop.status_code == 403

    idor_screenshot = await client.get(f"/api/v1/applications/{app_id}/screenshot", headers=other_headers)
    assert idor_screenshot.status_code == 403

    # Verify screenshot endpoint 404 for authorized user when file not on disk
    auth_screenshot = await client.get(f"/api/v1/applications/{app_id}/screenshot", headers=headers)
    assert auth_screenshot.status_code == 404
