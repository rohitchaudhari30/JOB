from abc import ABC, abstractmethod
from typing import List
from app.domain.jobs.entities import Job, JobSource, UserJobState


class JobRepository(ABC):
    @abstractmethod
    async def get_by_id(self, job_id: str) -> Job | None:
        pass

    @abstractmethod
    async def get_by_external_id(self, source_id: str, external_job_id: str) -> Job | None:
        pass

    @abstractmethod
    async def get_by_canonical_key(self, canonical_job_key: str) -> Job | None:
        pass

    @abstractmethod
    async def save(self, job: Job) -> Job:
        pass

    @abstractmethod
    async def list_jobs(
        self,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        role: str | None = None,
        min_experience: float | None = None,
        max_experience: float | None = None,
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
        sort_by: str | None = "newest",
        exclude_job_ids: list[str] | None = None,
    ) -> List[Job]:
        pass

    @abstractmethod
    async def count_jobs(
        self,
        search: str | None = None,
        role: str | None = None,
        min_experience: float | None = None,
        max_experience: float | None = None,
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
        exclude_job_ids: list[str] | None = None,
    ) -> int:
        pass

    @abstractmethod
    async def touch_seen(self, job_id: str) -> None:
        pass

    @abstractmethod
    async def delete(self, job_id: str) -> bool:
        pass

    @abstractmethod
    async def clear_all(self, source_type: str | None = None) -> int:
        pass


class JobSourceRepository(ABC):
    @abstractmethod
    async def get_by_type(self, source_type: str) -> JobSource | None:
        pass

    @abstractmethod
    async def list_active_sources(self) -> List[JobSource]:
        pass

    @abstractmethod
    async def save(self, source: JobSource) -> JobSource:
        pass


class UserJobStateRepository(ABC):
    @abstractmethod
    async def get_state(self, user_id: str, job_id: str) -> UserJobState | None:
        pass

    @abstractmethod
    async def set_saved(self, user_id: str, job_id: str, is_saved: bool, notes: str | None = None) -> UserJobState:
        pass

    @abstractmethod
    async def set_dismissed(self, user_id: str, job_id: str, is_dismissed: bool) -> UserJobState:
        pass

    @abstractmethod
    async def list_saved_jobs(self, user_id: str, skip: int = 0, limit: int = 50) -> List[Job]:
        pass

    @abstractmethod
    async def list_dismissed_job_ids(self, user_id: str) -> List[str]:
        pass

    @abstractmethod
    async def get_user_states_for_jobs(self, user_id: str, job_ids: List[str]) -> dict[str, UserJobState]:
        pass
