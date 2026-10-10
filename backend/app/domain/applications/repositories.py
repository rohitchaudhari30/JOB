from abc import ABC, abstractmethod
from typing import List
from app.domain.applications.entities import Application, ApplicationEvent, ApplicationQuestion, WorkflowStateEnum


class ApplicationRepository(ABC):
    @abstractmethod
    async def get_by_id(self, application_id: str) -> Application | None:
        pass

    @abstractmethod
    async def get_by_user_and_job(self, user_id: str, job_id: str) -> Application | None:
        pass

    @abstractmethod
    async def save(
        self,
        application: Application,
        expected_state: WorkflowStateEnum | None = None,
        expected_attempt_id: str | None = None,
    ) -> Application:
        pass

    @abstractmethod
    async def add_event(self, event: ApplicationEvent) -> ApplicationEvent:
        pass

    @abstractmethod
    async def add_question(self, question: ApplicationQuestion) -> ApplicationQuestion:
        pass

    @abstractmethod
    async def list_by_user(
        self,
        user_id: str,
        state: str | None = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Application]:
        pass

    @abstractmethod
    async def count_by_state(self, user_id: str, state: str) -> int:
        pass

    @abstractmethod
    async def count_by_user(self, user_id: str, state: str | None = None) -> int:
        pass

    @abstractmethod
    async def get_aggregate_stats(self, user_id: str) -> dict:
        pass

    @abstractmethod
    async def get_applied_job_map(self, user_id: str) -> dict:
        pass

    @abstractmethod
    async def recover_stale_submitting_applications(self, older_than_seconds: int = 300) -> int:
        pass

