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
    assert len(data) >= 6

    naukri_item = next((item for item in data if item["platform"] == "naukri"), None)
    assert naukri_item is not None
    assert naukri_item["category"] == "PORTAL_DISCOVERY"
    assert naukri_item["is_auth_required"] is True

    greenhouse_item = next((item for item in data if item["platform"] == "greenhouse"), None)
    assert greenhouse_item is not None
    assert greenhouse_item["category"] == "ATS_APPLICATION"
    assert greenhouse_item["status"] == "CONNECTED"  # Type B public access is auto-ready

    # 2. Verify non-connected platform returns invalid/reauth
    verify_res = await client.post("/api/v1/connections/naukri/verify", headers=headers)
    assert verify_res.status_code == 200
    verify_data = verify_res.json()
    assert verify_data["is_valid"] is False
    assert verify_data["status"] == "REAUTH_REQUIRED"

    # 3. Disconnect platform
    disc_res = await client.post("/api/v1/connections/naukri/disconnect", headers=headers)
    assert disc_res.status_code == 200
    assert disc_res.json()["status"] == "NOT_CONNECTED"

