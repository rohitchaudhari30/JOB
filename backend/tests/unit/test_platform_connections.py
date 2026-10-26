import pytest
from app.domain.connections.entities import (
    ConnectionStatus,
    ConnectionType,
    PlatformCapability,
    PlatformCategory,
    PlatformManifest,
)
from app.infrastructure.connections.manifests import PlatformManifestRegistry, SUPPORTED_PLATFORMS


def test_platform_manifest_registry():
    manifests = PlatformManifestRegistry.list_all()
    assert len(manifests) == 2

    # Verify Naukri Manifest
    naukri = PlatformManifestRegistry.get("naukri")
    assert naukri is not None
    assert naukri.platform_id == "naukri"
    assert naukri.category == PlatformCategory.PORTAL_DISCOVERY
    assert naukri.is_auth_required is True
    assert PlatformCapability.JOB_SEARCH in naukri.capabilities
    assert PlatformCapability.APPLICATION in naukri.capabilities

    # Verify LinkedIn Manifest
    linkedin = PlatformManifestRegistry.get("linkedin")
    assert linkedin is not None
    assert linkedin.platform_id == "linkedin"
    assert linkedin.category == PlatformCategory.PORTAL_DISCOVERY
    assert linkedin.is_auth_required is True
    assert PlatformCapability.JOB_SEARCH in linkedin.capabilities
    assert PlatformCapability.APPLICATION in linkedin.capabilities


def test_unknown_platform_returns_none():
    unknown = PlatformManifestRegistry.get("non_existent_portal_123")
    assert unknown is None


def test_session_state_encryption_and_decryption_roundtrip():
    from app.core.security import session_encryptor
    mock_storage_state = {
        "cookies": [
            {"name": "li_at", "value": "AQEDAT...secret_linkedin_session", "domain": ".linkedin.com"}
        ],
        "origins": []
    }

    # Encrypt
    encrypted_payload = session_encryptor.encrypt(mock_storage_state)
    assert isinstance(encrypted_payload, str)
    assert "AQEDAT" not in encrypted_payload  # Plaintext token must not be leaked

    # Decrypt
    decrypted_state = session_encryptor.decrypt(encrypted_payload)
    assert decrypted_state == mock_storage_state
    assert decrypted_state["cookies"][0]["value"] == "AQEDAT...secret_linkedin_session"
