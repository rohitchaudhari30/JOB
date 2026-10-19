"""SEC-08: the refresh token is an HttpOnly cookie, never in the response body or readable by scripts."""
import pytest

PASSWORD = "Password123!"


async def _login(client, email):
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return r


@pytest.mark.asyncio
async def test_cookie_is_httponly_strict_and_scoped_to_auth_endpoints(client):
    res = await _login(client, "cookie.flags@example.com")
    header = next(h for h in res.headers.get_list("set-cookie") if h.startswith("refresh_token="))
    low = header.lower()
    assert "httponly" in low
    assert "samesite=strict" in low
    assert "path=/api/v1/auth" in low
    assert "max-age=" in low
    assert "refresh_token" not in res.json()


@pytest.mark.asyncio
async def test_secure_flag_is_on_outside_dev(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "APP_ENV", "production")
    res = await _login(client, "cookie.secure@example.com")
    header = next(h for h in res.headers.get_list("set-cookie") if h.startswith("refresh_token="))
    assert "secure" in header.lower()


@pytest.mark.asyncio
async def test_refresh_uses_cookie_rotates_it_and_rejects_no_token(client):
    await _login(client, "cookie.rotate@example.com")
    first_cookie = client.cookies.get("refresh_token")
    ok = await client.post("/api/v1/auth/refresh")
    assert ok.status_code == 200 and ok.json()["access_token"]
    assert client.cookies.get("refresh_token") != first_cookie  # rotated

    client.cookies.clear()
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_cookie_refuses_a_foreign_origin(client):
    await _login(client, "cookie.csrf@example.com")
    evil = await client.post("/api/v1/auth/refresh", headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403
    still_ok = await client.post("/api/v1/auth/refresh", headers={"Origin": "http://localhost:5173"})
    assert still_ok.status_code == 200


@pytest.mark.asyncio
async def test_logout_clears_the_cookie_and_revokes_the_token(client):
    r = await _login(client, "cookie.logout@example.com")
    stolen = client.cookies.get("refresh_token")
    out = await client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert out.status_code == 200
    assert any(h.startswith("refresh_token=") and ("max-age=0" in h.lower() or "expires=" in h.lower())
               for h in out.headers.get_list("set-cookie"))
    client.cookies.clear()
    replay = await client.post("/api/v1/auth/refresh", json={"refresh_token": stolen})
    assert replay.status_code == 401
