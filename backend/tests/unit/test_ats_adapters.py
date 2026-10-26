import pytest
from app.infrastructure.browser.adapters.registry import adapter_registry


def test_supported_sources_registry():
    sources = adapter_registry.list_supported_sources()
    assert "naukri" in sources
    assert "linkedin" in sources
    assert len(sources) == 2


def test_instantiate_registered_adapters():
    for source in ["naukri", "linkedin"]:
        adapter = adapter_registry.get_source_adapter(source)
        assert adapter is not None
        assert adapter.source_type == source
