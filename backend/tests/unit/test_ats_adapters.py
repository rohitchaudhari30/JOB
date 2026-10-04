import pytest
from app.infrastructure.browser.adapters.registry import adapter_registry


def test_supported_sources_registry():
    sources = adapter_registry.list_supported_sources()
    assert "naukri" in sources
    assert "linkedin" in sources
    assert "greenhouse" in sources
    assert "lever" in sources
    assert "workday" in sources
    assert "ashby" in sources


def test_instantiate_registered_adapters():
    for source in ["naukri", "linkedin", "greenhouse", "lever", "workday", "ashby"]:
        adapter = adapter_registry.get_source_adapter(source)
        assert adapter is not None
        assert adapter.source_type == source
