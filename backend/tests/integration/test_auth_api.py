import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_and_login_flow(client: AsyncClient):
    # 1. Register new user
    register_payload = {
        "email": "engineer@example.com",
        "password": "SecurePassword123!",
        "full_name": "Senior Engineer",
    }
    reg_res = await client.post("/api/v1/auth/register", json=register_payload)
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert data["email"] == "engineer@example.com"
    assert "access_token" in data
    token = data["access_token"]

    # 2. Duplicate registration should be rejected
    dup_res = await client.post("/api/v1/auth/register", json=register_payload)
    assert dup_res.status_code == 409

    # 3. Login with credentials
    login_payload = {
        "email": "engineer@example.com",
        "password": "SecurePassword123!",
    }
    login_res = await client.post("/api/v1/auth/login", json=login_payload)
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data

    # 4. Access protected /me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    me_res = await client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "engineer@example.com"
    assert me_data["full_name"] == "Senior Engineer"
