import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_liveness_and_readiness(client: AsyncClient):
    live = await client.get("/api/v1/health")
    assert live.status_code == 200 and live.json()["status"] == "alive"

    ready = await client.get("/api/v1/health/ready")
    assert ready.status_code == 200 and ready.json()["database"] == "connected"


@pytest.mark.asyncio
async def test_readiness_returns_503_when_database_is_down(client: AsyncClient, monkeypatch):
    from app.core import database

    class BrokenSession:
        async def __aenter__(self):
            raise RuntimeError("db down")

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(database, "AsyncSessionLocal", lambda: BrokenSession())
    res = await client.get("/api/v1/health/ready")
    assert res.status_code == 503
    assert res.json()["status"] == "not_ready"
