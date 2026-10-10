from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Optional
from app.domain.jobs.entities import Job, SearchQueryFilter


class BaseJobSourceAdapter(ABC):
    """Abstract base adapter for discovering and extracting jobs from a platform."""

    @property
    @abstractmethod
    def source_type(self) -> str:
        """Returns unique platform identifier, e.g. 'naukri', 'linkedin', 'greenhouse'."""
        pass

    @property
    def capabilities(self) -> List[str]:
        """Returns list of capabilities advertised by this adapter."""
        return ["JOB_SEARCH", "JOB_DETAILS"]

    @abstractmethod
    async def health_check(self, context) -> bool:
        """Verifies if the current browser session is logged in and active."""
        pass

    @abstractmethod
    async def search_jobs(self, context, filters: SearchQueryFilter, **kwargs) -> AsyncGenerator[Job, None]:
        """
        Navigates to search page, applies filters, paginates through listings,
        and yields normalized Job domain entities.
        """
        pass

    @abstractmethod
    async def fetch_job_details(self, context, external_job_id: str, apply_url: str) -> Optional[Job]:
        """Fetches the complete raw description and requirements for a specific job."""
        pass


class BaseApplicationAdapter(ABC):
    """Abstract base adapter for filling and submitting job applications on a platform."""

    @property
    @abstractmethod
    def source_type(self) -> str:
        pass

    @property
    def capabilities(self) -> List[str]:
        return ["APPLICATION"]

    @abstractmethod
    async def open_application(self, page, apply_url: str) -> bool:
        """Navigates to the apply page and initializes the application flow."""
        pass

    @abstractmethod
    async def handle_challenge(self, page) -> Optional[str]:
        """Checks if an OTP, CAPTCHA, or verification barrier is blocking submission."""
        pass

    @abstractmethod
    async def submit_application(self, page) -> bool:
        """Triggers final submission and verifies confirmation."""
        pass

    async def verify_submission(self, page, original_url: str) -> Optional[tuple[bool, str]]:
        """
        Platform-specific post-submit verification hook.
        Returns:
            (True, detail_message) -> Confirmed submission
            (False, detail_message) -> Confirmed rejection / validation error
            None -> Inconclusive / unhandled, fall back to conservative default heuristics
        """
        return None

