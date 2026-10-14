import pytest

from app.domain.connections.entities import ConnectionStatus
from app.infrastructure.connections import connection_health
from app.infrastructure.connections.connection_health import ConnectionHealthChecker


@pytest.mark.asyncio
async def test_probe_error_is_not_reported_as_reauth(monkeypatch):
    def broken_decrypt(_):
        raise RuntimeError("network or crypto failure")

    monkeypatch.setattr(connection_health.session_crypto, "decrypt_storage_state", broken_decrypt)
    status = await ConnectionHealthChecker.check_health("naukri", "some-encrypted-blob")
    assert status == ConnectionStatus.ERROR
