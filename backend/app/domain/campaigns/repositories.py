from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.campaigns.entities import (
    Campaign,
    CampaignActivityLog,
    CampaignExecution,
    CampaignJobItem,
    QuotaReservation,
)


class CampaignRepository(ABC):
    @abstractmethod
    async def get_by_id(self, campaign_id: str) -> Optional[Campaign]:
        pass

    @abstractmethod
    async def list_by_user(self, user_id: str, limit: int = 50, skip: int = 0) -> List[Campaign]:
        pass

    @abstractmethod
    async def save(self, campaign: Campaign) -> Campaign:
        pass

    @abstractmethod
    async def delete(self, campaign_id: str, user_id: str) -> bool:
        pass

    @abstractmethod
    async def count_today_applications(self, campaign_id: str) -> int:
        pass

    @abstractmethod
    async def count_hourly_applications(self, campaign_id: str) -> int:
        pass


class CampaignExecutionRepository(ABC):
    @abstractmethod
    async def get_by_id(self, execution_id: str) -> Optional[CampaignExecution]:
        pass

    @abstractmethod
    async def get_active_by_campaign(self, campaign_id: str) -> Optional[CampaignExecution]:
        pass

    @abstractmethod
    async def acquire_or_get_active_execution(
        self,
        campaign_id: str,
        user_id: str,
        worker_id: str = "worker-1",
        lease_seconds: int = 300,
        initial_status: str = "RUNNING",
    ) -> tuple[CampaignExecution, bool]:
        """Atomically acquires an execution lock for a campaign or returns the existing active execution."""
        pass

    @abstractmethod
    async def record_heartbeat(
        self,
        execution_id: str,
        worker_id: str,
        lease_seconds: int = 300,
        lease_version: Optional[int] = None,
    ) -> Optional[CampaignExecution]:
        """Updates worker heartbeat and extends lease expiration."""
        pass

    @abstractmethod
    async def reclaim_expired_leases(self) -> int:
        """Finds active executions with expired leases and safely marks them FAILED/ABORTED."""
        pass

    @abstractmethod
    async def save(self, execution: CampaignExecution) -> CampaignExecution:
        pass

    @abstractmethod
    async def save_job_item(self, item: CampaignJobItem) -> CampaignJobItem:
        pass

    @abstractmethod
    async def list_job_items(self, execution_id: str, limit: int = 50) -> List[CampaignJobItem]:
        pass


class CampaignActivityLogRepository(ABC):
    @abstractmethod
    async def log(self, log_entry: CampaignActivityLog) -> CampaignActivityLog:
        pass

    @abstractmethod
    async def list_logs(self, execution_id: str, limit: int = 100) -> List[CampaignActivityLog]:
        pass


class QuotaReservationRepository(ABC):
    @abstractmethod
    async def reserve_slot(
        self,
        campaign_id: str,
        user_id: str,
        job_id: str,
        daily_limit: int,
        execution_id: Optional[str] = None,
        hourly_limit: Optional[int] = None,
        ttl_seconds: int = 600,
    ) -> Optional[QuotaReservation]:
        """Atomically checks limits and reserves a quota slot. Returns reservation if successful, None if limits exceeded."""
        pass

    @abstractmethod
    async def consume_slot(self, reservation_id: str) -> bool:
        """Transitions reservation to CONSUMED upon successful application submission."""
        pass

    @abstractmethod
    async def release_slot(self, reservation_id: str) -> bool:
        """Transitions reservation to RELEASED upon failure or skip, returning capacity."""
        pass

    @abstractmethod
    async def get_by_id(self, reservation_id: str) -> Optional[QuotaReservation]:
        pass

    @abstractmethod
    async def count_active_reservations_today(self, campaign_id: str) -> int:
        pass
