import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_connections_api_lifecycle(client: AsyncClient):
    # Register test user
    reg_res = await client.post(
        "/api/v1/auth/register",
        json={"email": "connection.tester@example.com", "password": "Password123!", "full_name": "Conn Tester"},
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. List connections (should return all supported platforms)
    res = await client.get("/api/v1/connections", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 2

    naukri_item = next((item for item in data if item["platform"] == "naukri"), None)
    assert naukri_item is not None
    assert naukri_item["category"] == "PORTAL_DISCOVERY"
    assert naukri_item["is_auth_required"] is True

    linkedin_item = next((item for item in data if item["platform"] == "linkedin"), None)
    assert linkedin_item is not None
    assert linkedin_item["category"] == "PORTAL_DISCOVERY"
    assert linkedin_item["is_auth_required"] is True

    # 2. A platform that was never connected is NOT_CONNECTED (not "reauth required")
    verify_res = await client.post("/api/v1/connections/naukri/verify", headers=headers)
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["is_valid"] is False
    assert verify_data["status"] == "NOT_CONNECTED"

    # 3. Disconnect platform
    disc_res = await client.post("/api/v1/connections/naukri/disconnect", headers=headers)
    assert disc_res.status_code == 200
    assert disc_res.json()["status"] == "NOT_CONNECTED"



@pytest.mark.asyncio
async def test_import_session_connects_without_a_login_window(client: AsyncClient):
    user = {"email": "import.session@example.com", "password": "Password123!", "full_name": "Import"}
    await client.post("/api/v1/auth/register", json=user)
    login = await client.post("/api/v1/auth/login", json={"email": user["email"], "password": user["password"]})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    bad = await client.post("/api/v1/connections/naukri/import-session", json={"storage_state": {"cookies": []}}, headers=headers)
    assert bad.status_code == 400

    state = {"cookies": [{"name": "sid", "value": "abc", "domain": ".naukri.com", "path": "/"}], "origins": []}
    ok = await client.post("/api/v1/connections/naukri/import-session", json={"storage_state": state}, headers=headers)
    assert ok.status_code == 200 and ok.json()["status"] == "CONNECTED"

    listing = await client.get("/api/v1/connections", headers=headers)
    naukri = next(c for c in listing.json() if c["platform"] == "naukri")
    assert naukri["status"] == "CONNECTED" and naukri["session_active"] is True

    # The stored session is encrypted, never returned in plain text.
    assert "abc" not in ok.text

    ats = await client.post("/api/v1/connections/greenhouse/import-session", json={"storage_state": state}, headers=headers)
    assert ats.status_code == 400
