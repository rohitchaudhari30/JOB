import logging
from typing import Dict, Type
from app.core.exceptions import PlatformException
from app.infrastructure.browser.adapters.base import BaseApplicationAdapter, BaseJobSourceAdapter

logger = logging.getLogger("app.adapters.registry")


class AdapterRegistry:
    """Central factory and registry for job source and application adapters."""

    def __init__(self):
        self._source_adapters: Dict[str, Type[BaseJobSourceAdapter]] = {}
        self._app_adapters: Dict[str, Type[BaseApplicationAdapter]] = {}

    def register_source(self, source_type: str, adapter_cls: Type[BaseJobSourceAdapter]):
        self._source_adapters[source_type.lower()] = adapter_cls
        logger.info(f"Registered source adapter for: '{source_type}'")

    def register_application(self, source_type: str, adapter_cls: Type[BaseApplicationAdapter]):
        self._app_adapters[source_type.lower()] = adapter_cls
        logger.info(f"Registered application adapter for: '{source_type}'")

    def get_source_adapter(self, source_type: str) -> BaseJobSourceAdapter:
        source_key = source_type.lower()
        if source_key not in self._source_adapters:
            raise PlatformException(
                f"No source adapter registered for '{source_type}'.",
                status_code=400,
                details={"unsupported_source": source_type},
            )
        return self._source_adapters[source_key]()

    def get_application_adapter(self, source_type: str) -> BaseApplicationAdapter:
        source_key = source_type.lower()
        if source_key not in self._app_adapters:
            raise PlatformException(
                f"No application adapter registered for '{source_type}'.",
                status_code=400,
                details={"unsupported_source": source_type},
            )
        return self._app_adapters[source_key]()

    def list_supported_sources(self) -> list[str]:
        return sorted(list(self._source_adapters.keys()))


adapter_registry = AdapterRegistry()

# Register core platform adapters: Naukri and LinkedIn only
from app.infrastructure.browser.adapters.linkedin import LinkedInAdapter, LinkedInApplicationAdapter
from app.infrastructure.browser.adapters.naukri import NaukriAdapter, NaukriApplicationAdapter

adapter_registry.register_source("naukri", NaukriAdapter)
adapter_registry.register_source("linkedin", LinkedInAdapter)

adapter_registry.register_application("naukri", NaukriApplicationAdapter)
adapter_registry.register_application("linkedin", LinkedInApplicationAdapter)
