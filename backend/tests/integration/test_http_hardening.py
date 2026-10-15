"""SEC-13: security headers and narrowed CORS."""
import pytest


@pytest.mark.asyncio
async def test_security_headers_are_present(client):
    res = await client.get("/api/v1/health")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer"


@pytest.mark.asyncio
async def test_hsts_only_on_https(client):
    plain = await client.get("/api/v1/health")
    assert "strict-transport-security" not in plain.headers
    behind_proxy = await client.get("/api/v1/health", headers={"X-Forwarded-Proto": "https"})
    assert "strict-transport-security" in behind_proxy.headers


@pytest.mark.asyncio
async def test_cors_preflight_rejects_unlisted_headers_and_origins(client):
    ok = await client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"

    bad_header = await client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-evil-header",
        },
    )
    assert bad_header.status_code == 400

    bad_origin = await client.options(
        "/api/v1/health",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in bad_origin.headers
