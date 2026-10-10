from datetime import datetime, timezone
import logging
from typing import Any, Dict, List, Optional
import uuid

from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator
from app.core.exceptions import EntityNotFoundException, ValidationException
from app.domain.connections.entities import ConnectionStatus
from app.domain.campaigns.entities import (
    Campaign,
    CampaignActivityLog,
    CampaignExecution,
    CampaignJobItem,
    CampaignRule,
    CampaignSafetyPolicy,
    CampaignSchedule,
)
from app.domain.campaigns.repositories import (
    CampaignActivityLogRepository,
    CampaignExecutionRepository,
    CampaignRepository,
)
from app.domain.campaigns.state_machine import (
    CampaignStateEnum,
    CampaignStateMachine,
    ExecutionStateEnum,
    ExecutionStateMachine,
)

logger = logging.getLogger("app.application.campaigns")


class CreateCampaignUseCase:
    def __init__(self, campaign_repo: CampaignRepository):
        self._repo = campaign_repo

    async def execute(
        self,
        user_id: str,
        name: str,
        target_resume_id: Optional[str] = None,
        rule_data: Optional[Dict[str, Any]] = None,
        safety_data: Optional[Dict[str, Any]] = None,
        schedule_data: Optional[Dict[str, Any]] = None,
    ) -> Campaign:
        if not name or not name.strip():
            raise ValidationException("Campaign name cannot be empty.")

        rule = CampaignRule(**(rule_data or {}))
        safety = CampaignSafetyPolicy(**(safety_data or {}))
        schedule = CampaignSchedule(**(schedule_data or {}))

        campaign = Campaign(
            id=str(uuid.uuid4()),
            user_id=user_id,
            name=name.strip(),
            state=CampaignStateEnum.DRAFT.value,
            target_resume_id=target_resume_id,
            rule=rule,
            safety_policy=safety,
            schedule=schedule,
        )
        return await self._repo.save(campaign)


class UpdateCampaignUseCase:
    def __init__(self, campaign_repo: CampaignRepository):
        self._repo = campaign_repo

    async def execute(
        self,
        campaign_id: str,
        user_id: str,
        name: Optional[str] = None,
        state: Optional[str] = None,
        target_resume_id: Optional[str] = None,
        rule_data: Optional[Dict[str, Any]] = None,
        safety_data: Optional[Dict[str, Any]] = None,
        schedule_data: Optional[Dict[str, Any]] = None,
    ) -> Campaign:
        campaign = await self._repo.get_by_id(campaign_id)
        if not campaign or campaign.user_id != user_id:
            raise EntityNotFoundException("Campaign", campaign_id)

        if name is not None:
            campaign.name = name.strip()

        if state is not None:
            target_enum = CampaignStateEnum(state)
            CampaignStateMachine.validate_transition(CampaignStateEnum(campaign.state), target_enum)
            campaign.state = target_enum.value

        if target_resume_id is not None:
            campaign.target_resume_id = target_resume_id

        if rule_data:
            for k, v in rule_data.items():
                if hasattr(campaign.rule, k):
                    setattr(campaign.rule, k, v)

        if safety_data:
            for k, v in safety_data.items():
                if hasattr(campaign.safety_policy, k):
                    setattr(campaign.safety_policy, k, v)

        if schedule_data:
            for k, v in schedule_data.items():
                if hasattr(campaign.schedule, k):
                    setattr(campaign.schedule, k, v)

        campaign.updated_at = datetime.now(timezone.utc)
        return await self._repo.save(campaign)


class GetCampaignUseCase:
    def __init__(self, campaign_repo: CampaignRepository):
        self._repo = campaign_repo

    async def execute(self, campaign_id: str, user_id: str) -> Campaign:
        campaign = await self._repo.get_by_id(campaign_id)
        if not campaign or campaign.user_id != user_id:
            raise EntityNotFoundException("Campaign", campaign_id)
        return campaign


class ListCampaignsUseCase:
    def __init__(self, campaign_repo: CampaignRepository):
        self._repo = campaign_repo

    async def execute(self, user_id: str, limit: int = 50, skip: int = 0) -> List[Campaign]:
        return await self._repo.list_by_user(user_id=user_id, limit=limit, skip=skip)


class DeleteCampaignUseCase:
    def __init__(self, campaign_repo: CampaignRepository):
        self._repo = campaign_repo

    async def execute(self, campaign_id: str, user_id: str) -> bool:
        return await self._repo.delete(campaign_id=campaign_id, user_id=user_id)


class StartCampaignExecutionUseCase:
    def __init__(
        self,
        campaign_repo: CampaignRepository,
        execution_repo: CampaignExecutionRepository,
        log_repo: CampaignActivityLogRepository,
        connection_manager=None,
        connection_repo=None,
    ):
        self._campaign_repo = campaign_repo
        self._execution_repo = execution_repo
        self._log_repo = log_repo
        self._conn_mgr = connection_manager
        self._conn_repo = connection_repo

    async def execute(
        self,
        campaign_id: str,
        user_id: str,
        worker_id: str = "worker-1",
    ) -> CampaignExecution:
        campaign = await self._campaign_repo.get_by_id(campaign_id)
        if not campaign or campaign.user_id != user_id:
            raise EntityNotFoundException("Campaign", campaign_id)

        # 1. Pre-flight platform session check
        session_valid = True
        session_reason = "Platform sessions valid."
        if self._conn_repo:
            target_platforms = campaign.rule.target_platforms or ["naukri"]
            for plat in target_platforms:
                conn = await self._conn_repo.get_by_platform(user_id, plat.lower())
                if conn is None or conn.status != ConnectionStatus.CONNECTED:
                    session_valid = False
                    session_reason = f"Platform session for '{plat}' is not connected or session expired."
                    break

        # 2. Pre-flight safety check
        today_count = await self._campaign_repo.count_today_applications(campaign_id)
        hourly_count = await self._campaign_repo.count_hourly_applications(campaign_id)
        can_apply, safety_reason = SafetyPolicyEvaluator.evaluate(
            policy=campaign.safety_policy,
            today_count=today_count,
            hourly_count=hourly_count,
        )

        initial_status = ExecutionStateEnum.RUNNING.value
        if not session_valid:
            initial_status = ExecutionStateEnum.PAUSED_SESSION.value
        elif not can_apply:
            initial_status = ExecutionStateEnum.PAUSED_LIMIT.value

        # 3. Atomic execution lock with worker lease
        saved_exec, was_created = await self._execution_repo.acquire_or_get_active_execution(
            campaign_id=campaign_id,
            user_id=user_id,
            worker_id=worker_id,
            lease_seconds=300,
            initial_status=initial_status,
        )

        if not was_created:
            logger.info(
                f"Campaign [{campaign_id}] already has active execution [{saved_exec.id}]. "
                f"Reusing without duplicate."
            )
            return saved_exec

        # 4. Strict Campaign vs Execution State Separation:
        # Campaign is the evergreen strategy; it remains RUNNING even if execution paused on limit/session.
        campaign.state = CampaignStateEnum.RUNNING.value
        await self._campaign_repo.save(campaign)

        # 5. Audit Log
        status_note = session_reason if not session_valid else safety_reason
        await self._log_repo.log(
            CampaignActivityLog(
                id=str(uuid.uuid4()),
                execution_id=saved_exec.id,
                level="INFO" if (can_apply and session_valid) else "WARNING",
                event_type="EXECUTION_START",
                message=f"Campaign execution started. Status: {initial_status}. Note: {status_note}",
                metadata={
                    "today_applications": today_count,
                    "hourly_applications": hourly_count,
                    "daily_limit": campaign.safety_policy.daily_application_limit,
                    "worker_id": worker_id,
                    "initial_status": initial_status,
                },
            )
        )
        return saved_exec


class RecordWorkerHeartbeatUseCase:
    def __init__(self, execution_repo: CampaignExecutionRepository):
        self._execution_repo = execution_repo

    async def execute(
        self,
        execution_id: str,
        worker_id: str,
        lease_seconds: int = 300,
        lease_version: Optional[int] = None,
    ) -> Optional[CampaignExecution]:
        if lease_version is not None:
            return await self._execution_repo.record_heartbeat(
                execution_id,
                worker_id,
                lease_seconds,
                lease_version=lease_version,
            )
        return await self._execution_repo.record_heartbeat(execution_id, worker_id, lease_seconds)


class ReclaimAbandonedExecutionsUseCase:
    def __init__(self, execution_repo: CampaignExecutionRepository):
        self._execution_repo = execution_repo

    async def execute(self) -> int:
        return await self._execution_repo.reclaim_expired_leases()


class PauseCampaignExecutionUseCase:
    def __init__(
        self,
        campaign_repo: CampaignRepository,
        execution_repo: CampaignExecutionRepository,
        log_repo: CampaignActivityLogRepository,
    ):
        self._campaign_repo = campaign_repo
        self._execution_repo = execution_repo
        self._log_repo = log_repo

    async def execute(self, campaign_id: str, user_id: str, reason: str = "User requested pause") -> CampaignExecution:
        execution = await self._execution_repo.get_active_by_campaign(campaign_id)
        if not execution:
            raise EntityNotFoundException("CampaignExecution", campaign_id)

        # Idempotency guard: If execution is already paused by the user, return safely
        if execution.status == ExecutionStateEnum.PAUSED_USER.value:
            logger.info(f"Execution {execution.id} of campaign {campaign_id} is already in PAUSED_USER state. Idempotent return.")
            return execution

        ExecutionStateMachine.validate_transition(
            ExecutionStateEnum(execution.status),
            ExecutionStateEnum.PAUSED_USER,
        )
        execution.status = ExecutionStateEnum.PAUSED_USER.value
        saved_exec = await self._execution_repo.save(execution)

        # Update campaign state
        campaign = await self._campaign_repo.get_by_id(campaign_id)
        if campaign:
            campaign.state = CampaignStateEnum.PAUSED.value
            await self._campaign_repo.save(campaign)

        await self._log_repo.log(
            CampaignActivityLog(
                id=str(uuid.uuid4()),
                execution_id=saved_exec.id,
                level="INFO",
                event_type="PAUSE",
                message=f"Execution paused. Reason: {reason}",
            )
        )
        return saved_exec


class ResumeCampaignExecutionUseCase:
    def __init__(
        self,
        campaign_repo: CampaignRepository,
        execution_repo: CampaignExecutionRepository,
        log_repo: CampaignActivityLogRepository,
    ):
        self._campaign_repo = campaign_repo
        self._execution_repo = execution_repo
        self._log_repo = log_repo

    async def execute(self, campaign_id: str, user_id: str) -> CampaignExecution:
        execution = await self._execution_repo.get_active_by_campaign(campaign_id)
        if not execution:
            raise EntityNotFoundException("CampaignExecution", campaign_id)

        # Idempotency guard: If execution is already running, return safely
        if execution.status == ExecutionStateEnum.RUNNING.value:
            logger.info(f"Execution {execution.id} of campaign {campaign_id} is already in RUNNING state. Idempotent return.")
            return execution

        ExecutionStateMachine.validate_transition(
            ExecutionStateEnum(execution.status),
            ExecutionStateEnum.RUNNING,
        )
        execution.status = ExecutionStateEnum.RUNNING.value
        saved_exec = await self._execution_repo.save(execution)

        campaign = await self._campaign_repo.get_by_id(campaign_id)
        if campaign:
            campaign.state = CampaignStateEnum.RUNNING.value
            await self._campaign_repo.save(campaign)

        await self._log_repo.log(
            CampaignActivityLog(
                id=str(uuid.uuid4()),
                execution_id=saved_exec.id,
                level="INFO",
                event_type="RESUME",
                message="Execution resumed by candidate.",
            )
        )
        return saved_exec


class StopCampaignExecutionUseCase:
    def __init__(
        self,
        campaign_repo: CampaignRepository,
        execution_repo: CampaignExecutionRepository,
        log_repo: CampaignActivityLogRepository,
    ):
        self._campaign_repo = campaign_repo
        self._execution_repo = execution_repo
        self._log_repo = log_repo

    async def execute(self, campaign_id: str, user_id: str, reason: str = "User stopped") -> CampaignExecution:
        campaign = await self._campaign_repo.get_by_id(campaign_id)
        if not campaign or campaign.user_id != user_id:
            raise EntityNotFoundException("Campaign", campaign_id)

        campaign.state = CampaignStateEnum.COMPLETED.value
        await self._campaign_repo.save(campaign)

        execution = await self._execution_repo.get_active_by_campaign(campaign_id)
        if not execution:
            logger.info(f"Campaign {campaign_id} has no active execution to stop. Campaign marked COMPLETED.")
            return CampaignExecution(
                id=str(uuid.uuid4()),
                campaign_id=campaign_id,
                user_id=user_id,
                status=ExecutionStateEnum.ABORTED.value,
                started_at=datetime.now(timezone.utc),
                completed_at=datetime.now(timezone.utc),
            )

        # Idempotency guard: If execution is already stopped/aborted, return safely
        if execution.status in (ExecutionStateEnum.ABORTED.value, ExecutionStateEnum.COMPLETED.value):
            logger.info(f"Execution {execution.id} of campaign {campaign_id} is already in {execution.status} state. Idempotent return.")
            return execution

        execution.status = ExecutionStateEnum.ABORTED.value
        execution.completed_at = datetime.now(timezone.utc)
        saved_exec = await self._execution_repo.save(execution)

        await self._log_repo.log(
            CampaignActivityLog(
                id=str(uuid.uuid4()),
                execution_id=saved_exec.id,
                level="INFO",
                event_type="STOP",
                message=f"Execution stopped. Reason: {reason}",
            )
        )
        return saved_exec


class GetCampaignActivityLogsUseCase:
    def __init__(
        self,
        campaign_repo: CampaignRepository,
        execution_repo: CampaignExecutionRepository,
        log_repo: CampaignActivityLogRepository,
    ):
        self._campaign_repo = campaign_repo
        self._execution_repo = execution_repo
        self._log_repo = log_repo

    async def execute(self, campaign_id: str, user_id: str, limit: int = 50) -> List[CampaignActivityLog]:
        campaign = await self._campaign_repo.get_by_id(campaign_id)
        if not campaign or campaign.user_id != user_id:
            raise EntityNotFoundException("Campaign", campaign_id)

        execution = await self._execution_repo.get_active_by_campaign(campaign_id)
        if not execution:
            return []

        return await self._log_repo.list_logs(execution_id=execution.id, limit=limit)

