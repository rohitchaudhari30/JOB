from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.matching.entities import MatchingTask, MatchingTaskStatus, MatchResult


class MatchResultRepository(ABC):
    @abstractmethod
    async def get_by_user_and_job(self, user_id: str, job_id: str) -> MatchResult | None:
        pass

    @abstractmethod
    async def get_by_evaluation_key(self, user_id: str, job_id: str, evaluation_key: str) -> MatchResult | None:
        """Find an existing match result by deterministic idempotency evaluation key."""
        pass

    @abstractmethod
    async def save(self, match: MatchResult) -> MatchResult:
        pass

    @abstractmethod
    async def list_by_user(
        self,
        user_id: str,
        min_score: float | None = None,
        decision: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[MatchResult]:
        pass


class MatchingTaskRepository(ABC):
    @abstractmethod
    async def enqueue_task(
        self,
        user_id: str,
        job_id: str,
        task_idempotency_key: str,
        campaign_id: Optional[str] = None,
        resume_id: Optional[str] = None,
    ) -> MatchingTask:
        """Atomically enqueues a matching task if not already queued with this idempotency key."""
        pass

    @abstractmethod
    async def claim_next_task(
        self,
        worker_id: str,
        lease_seconds: int = 120,
    ) -> Optional[MatchingTask]:
        """Atomically claims the next eligible task (QUEUED or expired LEASED) using fencing token."""
        pass

    @abstractmethod
    async def complete_task(self, task_id: str, worker_id: str, lease_version: int) -> bool:
        """Transitions task to COMPLETED with worker fencing check."""
        pass

    @abstractmethod
    async def fail_task(
        self,
        task_id: str,
        worker_id: str,
        lease_version: int,
        error_message: str,
        retryable: bool = True,
    ) -> bool:
        """Transitions task to RETRY or FAILED with worker fencing check."""
        pass

    @abstractmethod
    async def get_by_id(self, task_id: str) -> Optional[MatchingTask]:
        pass

    @abstractmethod
    async def count_pending_tasks(self, user_id: Optional[str] = None) -> int:
        pass
