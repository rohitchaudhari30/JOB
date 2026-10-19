"""Q-08: change password (signs out other sessions), export my data (no secrets), delete account."""
import json
import time

import pytest
from httpx import AsyncClient

PW = "Password123!"
NEW = "BrandNewPass456!"


async def _register(client: AsyncClient, email: str):
    r = await client.post("/api/v1/auth/register", json={"email": email, "password": PW})
    assert r.status_code == 201, r.text
    return r.json()["access_token"], client.cookies.get("refresh_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.mark.asyncio
async def test_change_password_needs_the_current_one_and_a_different_valid_new_one(client):
    tok, _ = await _register(client, "cp1@example.com")
    url = "/api/v1/auth/change-password"
    assert (await client.post(url, headers=_h(tok), json={"current_password": "wrong-pass-1", "new_password": NEW})).status_code == 403
    assert (await client.post(url, headers=_h(tok), json={"current_password": PW, "new_password": PW})).status_code == 400
    assert (await client.post(url, headers=_h(tok), json={"current_password": PW, "new_password": "short"})).status_code == 422
    assert (await client.post("/api/v1/auth/login", json={"email": "cp1@example.com", "password": PW})).status_code == 200  # unchanged


@pytest.mark.asyncio
async def test_change_password_signs_out_other_sessions_but_not_this_one(client):
    old_access, old_refresh = await _register(client, "cp2@example.com")
    time.sleep(1.1)  # tokens carry whole-second issue times; make the change land in a later second
    res = await client.post("/api/v1/auth/change-password", headers=_h(old_access), json={"current_password": PW, "new_password": NEW})
    assert res.status_code == 200
    new_access = res.json()["access_token"]
    assert "refresh_token" not in res.json() and client.cookies.get("refresh_token")

    # other devices: the old access token and the old refresh token are both dead
    assert (await client.get("/api/v1/auth/me", headers=_h(old_access))).status_code == 401
    client.cookies.clear()
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})).status_code == 401

    # this device keeps working with the fresh token, and the new password logs in
    assert (await client.get("/api/v1/auth/me", headers=_h(new_access))).status_code == 200
    assert (await client.post("/api/v1/auth/login", json={"email": "cp2@example.com", "password": PW})).status_code == 401
    assert (await client.post("/api/v1/auth/login", json={"email": "cp2@example.com", "password": NEW})).status_code == 200


@pytest.mark.asyncio
async def test_a_user_who_never_changed_password_is_not_affected(client):
    tok, refresh = await _register(client, "cp3@example.com")
    assert (await client.get("/api/v1/auth/me", headers=_h(tok))).status_code == 200
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200


@pytest.mark.asyncio
async def test_export_contains_my_data_and_no_credentials(client):
    tok, _ = await _register(client, "ex1@example.com")
    await client.put("/api/v1/profile", headers=_h(tok), json={"headline": "Staff Engineer", "phone": "123"})
    res = await client.get("/api/v1/auth/me/export", headers=_h(tok))
    assert res.status_code == 200
    assert "attachment" in res.headers["content-disposition"] and res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["account"]["email"] == "ex1@example.com"
    assert any(p.get("headline") == "Staff Engineer" for p in body["tables"]["candidate_profiles"])
    text = res.text.lower()
    for forbidden in ("hashed_password", "encrypted_storage_state", "$2b$", tok, "screenshot_file_path", "file_path"):
        assert forbidden.lower() not in text, forbidden


@pytest.mark.asyncio
async def test_export_never_includes_another_users_rows(client):
    tok_a, _ = await _register(client, "ex2a@example.com")
    await client.put("/api/v1/profile", headers=_h(tok_a), json={"headline": "ALPHA-SECRET-HEADLINE"})
    client.cookies.clear()
    tok_b, _ = await _register(client, "ex2b@example.com")
    res = await client.get("/api/v1/auth/me/export", headers=_h(tok_b))
    assert "ALPHA-SECRET-HEADLINE" not in res.text and "ex2a@example.com" not in res.text


@pytest.mark.asyncio
async def test_export_and_change_password_need_a_login(client):
    assert (await client.get("/api/v1/auth/me/export")).status_code == 401
    assert (await client.post("/api/v1/auth/change-password", json={"current_password": PW, "new_password": NEW})).status_code == 401


def test_cutoff_logic_is_second_resolution_and_fail_closed():
    from datetime import datetime, timezone

    from app.core.security import issued_before_cutoff

    cut = datetime(2026, 1, 1, 12, 0, 0, 500_000, tzinfo=timezone.utc)
    base = int(cut.timestamp())
    assert issued_before_cutoff({"iat": base - 1}, cut) is True
    assert issued_before_cutoff({"iat": base}, cut) is False  # same second: the fresh token is kept
    assert issued_before_cutoff({}, cut) is True  # no issue time on a user with a cut-off
    assert issued_before_cutoff({}, None) is False  # no cut-off: nothing to check
    assert issued_before_cutoff({"iat": 1}, None) is False
