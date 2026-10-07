from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.automation.entities import AutomationRun


class AutomationRunRepository(ABC):
    """Abstract interface for managing persistent automation run records."""

    @abstractmethod
    async def get_by_id(self, run_id: str) -> Optional[AutomationRun]:
        pass

    @abstractmethod
    async def get_active_run_for_user(self, user_id: str) -> Optional[AutomationRun]:
        pass

    @abstractmethod
    async def list_by_user_id(self, user_id: str, limit: int = 50) -> List[AutomationRun]:
        pass

    @abstractmethod
    async def create(self, run: AutomationRun) -> AutomationRun:
        pass

    @abstractmethod
    async def update(self, run: AutomationRun) -> AutomationRun:
        pass
