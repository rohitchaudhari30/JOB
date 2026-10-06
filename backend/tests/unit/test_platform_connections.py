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
    assert len(manifests) >= 6

    # Verify Naukri Manifest
    naukri = PlatformManifestRegistry.get("naukri")
    assert naukri is not None
    assert naukri.platform_id == "naukri"
    assert naukri.category == PlatformCategory.PORTAL_DISCOVERY
    assert naukri.is_auth_required is True
    assert PlatformCapability.JOB_SEARCH in naukri.capabilities
    assert PlatformCapability.APPLICATION in naukri.capabilities

    # Verify Greenhouse Manifest (Type B ATS)
    greenhouse = PlatformManifestRegistry.get("greenhouse")
    assert greenhouse is not None
    assert greenhouse.category == PlatformCategory.ATS_APPLICATION
    assert greenhouse.is_auth_required is False
    assert greenhouse.connection_type == ConnectionType.PUBLIC_ACCESS


def test_unknown_platform_returns_none():
    unknown = PlatformManifestRegistry.get("non_existent_portal_123")
    assert unknown is None


def test_linkedin_platform_manifest():
    linkedin = PlatformManifestRegistry.get("linkedin")
    assert linkedin is not None
    assert linkedin.platform_id == "linkedin"
    assert linkedin.category == PlatformCategory.PORTAL_DISCOVERY
    assert linkedin.is_auth_required is True
    assert PlatformCapability.JOB_SEARCH in linkedin.capabilities
    assert PlatformCapability.APPLICATION in linkedin.capabilities


def test_session_state_encryption_and_decryption_roundtrip():
    from app.core.security import session_encryptor
    mock_storage_state = {
        "cookies": [
            {"name": "li_at", "value": "mock_linkedin_cookie_123", "domain": ".linkedin.com"},
            {"name": "naukri_auth", "value": "mock_naukri_token_456", "domain": ".naukri.com"},
        ],
        "origins": []
    }
    encrypted = session_encryptor.encrypt_storage_state(mock_storage_state)
    assert isinstance(encrypted, str)
    assert encrypted != ""

    decrypted = session_encryptor.decrypt_json(encrypted)
    assert decrypted == mock_storage_state
    assert decrypted["cookies"][0]["name"] == "li_at"
    assert decrypted["cookies"][1]["name"] == "naukri_auth"
