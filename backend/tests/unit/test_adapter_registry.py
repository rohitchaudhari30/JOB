import pytest
from app.core.exceptions import PlatformException
from app.domain.jobs.entities import Job, SearchQueryFilter
from app.infrastructure.browser.adapters.base import BaseApplicationAdapter, BaseJobSourceAdapter
from app.infrastructure.browser.adapters.registry import AdapterRegistry


class DummySourceAdapter(BaseJobSourceAdapter):
    @property
    def source_type(self) -> str:
        return "dummy_source"

    async def health_check(self, context) -> bool:
        return True

    async def search_jobs(self, context, filters: SearchQueryFilter, **kwargs):
        yield Job(
            id="job_1",
            source_id="dummy_source",
            external_job_id="ext_1",
            title="Software Engineer",
            company="Dummy Inc",
            location="Remote",
        )

    async def fetch_job_details(self, context, external_job_id: str, apply_url: str):
        return None


class DummyAppAdapter(BaseApplicationAdapter):
    @property
    def source_type(self) -> str:
        return "dummy_source"

    async def open_application(self, page, apply_url: str) -> bool:
        return True

    async def handle_challenge(self, page):
        return None

    async def submit_application(self, page) -> bool:
        return True


def test_adapter_registration_and_retrieval():
    registry = AdapterRegistry()
    registry.register_source("dummy_source", DummySourceAdapter)
    registry.register_application("dummy_source", DummyAppAdapter)

    source_adapter = registry.get_source_adapter("dummy_source")
    assert isinstance(source_adapter, DummySourceAdapter)
    assert source_adapter.source_type == "dummy_source"

    app_adapter = registry.get_application_adapter("dummy_source")
    assert isinstance(app_adapter, DummyAppAdapter)
    assert app_adapter.source_type == "dummy_source"


def test_unsupported_source_raises_platform_exception():
    registry = AdapterRegistry()
    with pytest.raises(PlatformException) as exc_info:
        registry.get_source_adapter("non_existent_portal")
    assert "No source adapter registered" in str(exc_info.value)
