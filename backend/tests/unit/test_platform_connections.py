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
