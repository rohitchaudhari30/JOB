# ADAPTERS.md — Source & Application Adapter Architecture

## 1. Core Adapter Philosophy

The platform decouples **Job Discovery** from **Job Application** through standard abstract base interfaces.

```
app/infrastructure/browser/adapters/
├── base.py                 # Abstract base contracts for discovery and application
├── registry.py             # Centralized AdapterRegistry factory
├── naukri.py               # Naukri discovery & application adapter
├── linkedin.py             # LinkedIn discovery & Easy Apply adapter
├── greenhouse.py           # Greenhouse job board & ATS application adapter
├── lever.py                # Lever ATS application adapter
├── workday.py              # Workday multi-step application adapter
├── ashby.py                # Ashby ATS application adapter
└── icims.py                # iCIMS ATS application adapter
```

---

## 2. Base Adapter Contracts

### 2.1 `BaseJobSourceAdapter` (Job Discovery Interface)
```python
from abc import ABC, abstractmethod
from typing import List, AsyncGenerator
from app.domain.jobs.entities import NormalizedJob, SearchQueryFilter

class BaseJobSourceAdapter(ABC):
    @property
    @abstractmethod
    def source_type(self) -> str:
        """Returns unique source identifier, e.g. 'naukri', 'linkedin'"""
        pass

    @abstractmethod
    async def health_check(self, context) -> bool:
        """Verifies if the current browser session is logged in and active."""
        pass

    @abstractmethod
    async def search_jobs(self, context, filters: SearchQueryFilter) -> AsyncGenerator[NormalizedJob, None]:
        """Navigates, executes search with filters, paginates, and yields normalized jobs."""
        pass

    @abstractmethod
    async def fetch_job_details(self, context, external_job_id: str, apply_url: str) -> NormalizedJob:
        """Fetches complete raw job description, requirements, and metadata."""
        pass
```

### 2.2 `BaseApplicationAdapter` (Application Execution Interface)
```python
from abc import ABC, abstractmethod
from app.domain.applications.entities import ApplicationContext, ApplicationResult

class BaseApplicationAdapter(ABC):
    @property
    @abstractmethod
    def source_type(self) -> str:
        pass

    @abstractmethod
    async def open_application(self, page, apply_url: str) -> bool:
        """Navigates to the apply page and initiates the modal/form."""
        pass

    @abstractmethod
    async def execute_form_step(self, page, app_context: ApplicationContext) -> ApplicationResult:
        """Detects fields on the current step, maps profile values, and fills inputs."""
        pass

    @abstractmethod
    async def handle_challenge(self, page) -> str | None:
        """Detects OTP, CAPTCHA, or custom modal barriers (returns challenge type or None)."""
        pass

    @abstractmethod
    async def submit_application(self, page) -> bool:
        """Validates final review screen and triggers final submission."""
        pass

### 2.3 Date Parsing & Freshness Contract
All source adapters must extract raw date strings directly from the portal DOM cards (e.g., `".job-post-day"`, `time[datetime]`, `"span.posted-date"`):
- Extract the raw string without manual mutation: `raw_posted_text = await card.locator(...).text_content()`.
- Pass raw text to `PostedDateParser.parse(raw_posted_text)` from `app.domain.jobs.freshness`.
- Populate `posted_at`, `raw_posted_text`, `posted_at_precision`, `posted_at_source`, `freshness_bucket`, and `freshness_score` on the returned `NormalizedJob`.
- The adapter must **never** hardcode relative date arithmetic; date parsing is centralized in the domain parser.
```

---

## 3. Adapter Registry Pattern

The business logic never contains hardcoded platform switches. Adapters are registered and retrieved via `AdapterRegistry`:

```python
class AdapterRegistry:
    def __init__(self):
        self._source_adapters = {}
        self._app_adapters = {}

    def register_source(self, source_type: str, adapter_cls):
        self._source_adapters[source_type] = adapter_cls

    def register_application(self, source_type: str, adapter_cls):
        self._app_adapters[source_type] = adapter_cls

    def get_source_adapter(self, source_type: str) -> BaseJobSourceAdapter:
        if source_type not in self._source_adapters:
            raise UnsupportedSourceException(f"No source adapter registered for {source_type}")
        return self._source_adapters[source_type]()

    def get_application_adapter(self, source_type: str) -> BaseApplicationAdapter:
        if source_type not in self._app_adapters:
            raise UnsupportedApplicationException(f"No application adapter registered for {source_type}")
        return self._app_adapters[source_type]()
```

---

## 4. How to Add a New Adapter

Adding a new platform (e.g. `LeverAdapter`) requires only:
1. Create `infrastructure/browser/adapters/lever.py`.
2. Implement `BaseJobSourceAdapter` and/or `BaseApplicationAdapter`.
3. Register the new class in `infrastructure/browser/adapters/registry.py`.
4. Add contract tests in `tests/adapters/test_lever_adapter.py`.
5. **Zero modifications** required in `api/`, `domain/`, `application/`, or database models.
