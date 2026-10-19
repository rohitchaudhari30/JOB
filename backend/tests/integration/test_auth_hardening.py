"""SEC-04 / SEC-05 / SEC-06 / SEC-07."""
import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.config import settings
from app.core.rate_limit import reset_rate_limits
from app.core.security import create_access_token, create_refresh_token
from main import app

PASSWORD = "Password123!"


async def _register(client, email):
    res = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert res.status_code == 201, res.text
    data = res.json()
    assert "refresh_token" not in data  # never in the body (SEC-08): cookie only
    data["refresh_token"] = client.cookies.get("refresh_token")  # captured for the tests below
    client.cookies.clear()  # tests present the token explicitly, like an API client
    return data


@pytest.mark.asyncio
async def test_refresh_token_cannot_be_used_as_an_access_token(client):
    data = await _register(client, "type.check@example.com")
    bad = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['refresh_token']}"})
    assert bad.status_code == 401
    ok = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert ok.status_code == 200


@pytest.mark.asyncio
async def test_logout_revokes_access_and_refresh_tokens(client):
    data = await _register(client, "logout.user@example.com")
    headers = {"Authorization": f"Bearer {data['access_token']}"}

    out = await client.post("/api/v1/auth/logout", json={"refresh_token": data["refresh_token"]}, headers=headers)
    assert out.status_code == 200

    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401
    again = await client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert again.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_works_only_once(client):
    data = await _register(client, "rotate.user@example.com")
    first = await client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert first.status_code == 200
    client.cookies.clear()  # replay the OLD token, as a thief would
    second = await client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert second.status_code == 401
    # the new pair keeps working
    new_access = first.json()["access_token"]
    assert (await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {new_access}"})).status_code == 200


@pytest.mark.asyncio
async def test_weak_password_is_rejected(client):
    res = await client.post("/api/v1/auth/register", json={"email": "weak@example.com", "password": "a"})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_login_is_rate_limited(client, monkeypatch):
    monkeypatch.setattr(settings, "AUTH_RATE_LIMIT_ATTEMPTS", 3)
    reset_rate_limits()
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    codes = [(await client.post("/api/v1/auth/login", json=body)).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401]
    assert codes[3:] == [429, 429]
    reset_rate_limits()


def test_websocket_rejects_anonymous_and_refresh_tokens():
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect):
            with tc.websocket_connect("/api/v1/ws"):
                pass
        refresh = create_refresh_token({"sub": "someone"})
        with pytest.raises(WebSocketDisconnect):
            with tc.websocket_connect(f"/api/v1/ws?token={refresh}"):
                pass
