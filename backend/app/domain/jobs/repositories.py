from abc import ABC, abstractmethod
from typing import List
from app.domain.jobs.entities import Job, JobSource


class JobRepository(ABC):
    @abstractmethod
    async def get_by_id(self, job_id: str) -> Job | None:
        pass

    @abstractmethod
    async def get_by_external_id(self, source_id: str, external_job_id: str) -> Job | None:
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
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
        sort_by: str | None = "newest",
    ) -> List[Job]:
        pass

    @abstractmethod
    async def count_jobs(
        self,
        search: str | None = None,
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
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
