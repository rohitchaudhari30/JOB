from abc import ABC, abstractmethod
from typing import List
from app.domain.matching.entities import MatchResult


class MatchResultRepository(ABC):
    @abstractmethod
    async def get_by_user_and_job(self, user_id: str, job_id: str) -> MatchResult | None:
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
        limit: int = 50
    ) -> List[MatchResult]:
        pass
