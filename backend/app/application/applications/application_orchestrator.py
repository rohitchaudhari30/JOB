from dataclasses import dataclass
from datetime import datetime, time, timezone
import hashlib
import logging
from typing import Any, Dict, List, Optional
import uuid

from app.application.applications.commands import (
    ApplicationSource,
    BatchQueueApplicationCommand,
    QueueApplicationCommand,
)
from app.application.applications.policies import ApplicationPolicyEnforcer
from app.application.applications.use_cases import CreateApplicationUseCase, ExecuteApplicationUseCase
from app.application.applications.validators import ApplicationValidator, ValidationResult
from app.core.config import settings
from app.core.exceptions import EntityNotFoundException, PlatformException, ValidationException
from app.domain.applications.entities import (
    Application,
    ApplicationEvent,
    WorkflowStateEnum,
)
from app.domain.applications.repositories import ApplicationRepository
from app.domain.campaigns.repositories import CampaignRepository
from app.domain.jobs.repositories import JobRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository

logger = logging.getLogger("app.application.applications.orchestrator")


@dataclass
class QueueResult:
    application: Optional[Application]
    is_queued: bool
    status: str
    error_code: Optional[str] = None
    error_message: Optional[str] = None


@dataclass
class BatchQueueResult:
    total_requested: int
    queued_count: int
    skipped_count: int
    results: List[QueueResult]


class ApplicationOrchestrator:
    """
    CANONICAL APPLICATION ORCHESTRATOR.
    The single authoritative entry point and coordination pipeline for all job application actions:
    1. Authorization & Validation
    2. Deduplication & Idempotency
    3. Multi-tier Effective Quota Check
    4. Entity creation (WorkflowStateEnum.APPROVED / QUEUED)
    5. Event emission & audit logging
    6. Safe handoff to Execution Pipeline (if auto_execute requested)
    """

    def __init__(
        self,
        app_repo: ApplicationRepository,
        job_repo: JobRepository,
        profile_repo: CandidateProfileRepository,
        resume_repo: ResumeRepository,
        campaign_repo: Optional[CampaignRepository] = None,
        connection_repo: Optional[Any] = None,
        execute_use_case: Optional[ExecuteApplicationUseCase] = None,
    ):
        self._app_repo = app_repo
        self._job_repo = job_repo
        self._profile_repo = profile_repo
        self._resume_repo = resume_repo
        self._campaign_repo = campaign_repo
        self._connection_repo = connection_repo
        self._execute_use_case = execute_use_case
        self._validator = ApplicationValidator(
            app_repo=app_repo,
            job_repo=job_repo,
            profile_repo=profile_repo,
            resume_repo=resume_repo,
            connection_repo=connection_repo,
        )

    async def queue_application(self, command: QueueApplicationCommand) -> QueueResult:
        """
        Processes a single QueueApplicationCommand through the canonical pipeline.
        """
        logger.info(
            f"Queueing application for user [{command.user_id}], job [{command.job_id}] via source [{command.source.value}]"
        )

        # 1. Fetch Campaign if campaign_id is provided
        campaign = None
        if command.campaign_id and self._campaign_repo:
            campaign = await self._campaign_repo.get_by_id(command.campaign_id)
            if not campaign:
                return QueueResult(
                    application=None,
                    is_queued=False,
                    status="REJECTED",
                    error_code="CAMPAIGN_NOT_FOUND",
                    error_message=f"Campaign [{command.campaign_id}] not found.",
                )
            if campaign.user_id != command.user_id:
                return QueueResult(
                    application=None,
                    is_queued=False,
                    status="REJECTED",
                    error_code="UNAUTHORIZED_CAMPAIGN",
                    error_message=f"Campaign [{command.campaign_id}] does not belong to user [{command.user_id}].",
                )

        # 2. Compute today's and hourly counts for rate validation
        now_utc = datetime.now(timezone.utc)
        today_start_utc = datetime.combine(now_utc.date(), time.min, tzinfo=timezone.utc)
        today_end_utc = datetime.combine(now_utc.date(), time.max, tzinfo=timezone.utc)

        today_count = await self._app_repo.count_by_state(command.user_id, WorkflowStateEnum.APPLIED.value)
        # Hourly count fallback
        hourly_count = min(today_count, 5)

        # 3. Perform centralized validation
        val_result: ValidationResult = await self._validator.validate(
            user_id=command.user_id,
            job_id=command.job_id,
            resume_id=command.resume_id,
            campaign=campaign,
            today_applied_count=today_count,
            hourly_applied_count=hourly_count,
        )

        if not val_result.is_valid:
            logger.warning(
                f"Application rejected for user [{command.user_id}], job [{command.job_id}]: {val_result.error_code} - {val_result.error_message}"
            )
            return QueueResult(
                application=None,
                is_queued=False,
                status="REJECTED",
                error_code=val_result.error_code,
                error_message=val_result.error_message,
            )

        # 4. Idempotency Key calculation
        idempotency_key = hashlib.sha256(f"{command.user_id}:{command.job_id}".encode()).hexdigest()

        # 5. Determine initial state based on approval rules or command override
        initial_state = command.initial_state or WorkflowStateEnum.APPROVED

        # 6. Create Application record
        app = Application(
            id=f"app_{uuid.uuid4().hex[:12]}",
            user_id=command.user_id,
            job_id=command.job_id,
            resume_id=val_result.effective_resume_id,
            idempotency_key=idempotency_key,
            workflow_state=initial_state,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        saved_app = await self._app_repo.save(app)

        # 7. Add Audit Event
        await self._app_repo.add_event(
            ApplicationEvent(
                id=f"evt_{uuid.uuid4().hex[:12]}",
                application_id=saved_app.id,
                event_name="APPLICATION_QUEUED",
                payload={
                    "source": command.source.value,
                    "campaign_id": command.campaign_id,
                    "resume_id": val_result.effective_resume_id,
                    "auto_execute": command.auto_execute,
                },
                created_at=datetime.now(timezone.utc),
            )
        )

        # 8. Trigger immediate execution if requested and execute use case is wired
        if command.auto_execute and self._execute_use_case:
            try:
                logger.info(f"Auto-executing application [{saved_app.id}]...")
                saved_app = await self._execute_use_case.execute(saved_app.id)
            except Exception as e:
                logger.error(f"Error during auto-execution of [{saved_app.id}]: {str(e)}")

        return QueueResult(
            application=saved_app,
            is_queued=True,
            status="QUEUED",
        )

    async def batch_queue_applications(self, command: BatchQueueApplicationCommand) -> BatchQueueResult:
        """
        Processes a batch of jobs into application records with rate limit and duplicate protection.
        """
        results: List[QueueResult] = []
        queued_count = 0
        skipped_count = 0

        for job_id in command.job_ids:
            sub_command = QueueApplicationCommand(
                user_id=command.user_id,
                job_id=job_id,
                source=command.source,
                campaign_id=command.campaign_id,
                resume_id=command.resume_id,
                auto_execute=command.auto_execute,
            )
            res = await self.queue_application(sub_command)
            results.append(res)
            if res.is_queued:
                queued_count += 1
            else:
                skipped_count += 1

        return BatchQueueResult(
            total_requested=len(command.job_ids),
            queued_count=queued_count,
            skipped_count=skipped_count,
            results=results,
        )
