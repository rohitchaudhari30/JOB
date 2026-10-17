from datetime import datetime, timezone, timedelta
import logging
from typing import List, Optional
from sqlalchemy import desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.campaigns.entities import (
    Campaign,
    CampaignActivityLog,
    CampaignExecution,
    CampaignJobItem,
    CampaignRule,
    CampaignSafetyPolicy,
    CampaignSchedule,
    QuotaReservation,
    QuotaReservationStatus,
)
from app.domain.campaigns.repositories import (
    CampaignActivityLogRepository,
    CampaignExecutionRepository,
    CampaignRepository,
    QuotaReservationRepository,
)
from app.infrastructure.database.models.models import (
    CampaignActivityLogModel,
    CampaignExecutionModel,
    CampaignJobItemModel,
    CampaignModel,
    CampaignRuleModel,
    CampaignSafetyPolicyModel,
    CampaignScheduleModel,
    QuotaReservationModel,
)

logger = logging.getLogger("app.repositories.campaign")


class SqlAlchemyCampaignRepository(CampaignRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_domain(self, model: CampaignModel) -> Campaign:
        rule = CampaignRule(
            auto_apply_threshold=model.rule.auto_apply_threshold if model.rule else 80.0,
            review_threshold=model.rule.review_threshold if model.rule else 65.0,
            min_experience_years=model.rule.min_experience_years if model.rule else 0.0,
            max_experience_years=model.rule.max_experience_years if model.rule else 10.0,
            target_roles=model.rule.target_roles if model.rule else [],
            target_locations=model.rule.target_locations if model.rule else [],
            mandatory_skills=model.rule.mandatory_skills if model.rule else [],
            excluded_keywords=model.rule.excluded_keywords if model.rule else [],
            target_platforms=model.rule.target_platforms if model.rule else ["naukri"],
        ) if model.rule else CampaignRule()

        safety = CampaignSafetyPolicy(
            daily_application_limit=model.safety_policy.daily_application_limit if model.safety_policy else 20,
            hourly_application_limit=model.safety_policy.hourly_application_limit if model.safety_policy else 5,
            cooldown_seconds=model.safety_policy.cooldown_seconds if model.safety_policy else 90,
            operating_start_time=model.safety_policy.operating_start_time if model.safety_policy else "09:00",
            operating_end_time=model.safety_policy.operating_end_time if model.safety_policy else "18:00",
            max_concurrent_applications=model.safety_policy.max_concurrent_applications if model.safety_policy else 1,
            timezone=(model.safety_policy.timezone if model.safety_policy else None) or "UTC",
        ) if model.safety_policy else CampaignSafetyPolicy()

        schedule = CampaignSchedule(
            is_active=model.schedule.is_active if model.schedule else False,
            cron_expression=model.schedule.cron_expression if model.schedule else None,
            interval_minutes=model.schedule.interval_minutes if model.schedule else 240,
            last_run_at=model.schedule.last_run_at if model.schedule else None,
            next_run_at=model.schedule.next_run_at if model.schedule else None,
        ) if model.schedule else CampaignSchedule()

        return Campaign(
            id=model.id,
            user_id=model.user_id,
            name=model.name,
            state=model.state,
            target_resume_id=model.target_resume_id,
            rule=rule,
            safety_policy=safety,
            schedule=schedule,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def get_by_id(self, campaign_id: str) -> Optional[Campaign]:
        stmt = (
            select(CampaignModel)
            .options(
                selectinload(CampaignModel.rule),
                selectinload(CampaignModel.safety_policy),
                selectinload(CampaignModel.schedule),
            )
            .where(CampaignModel.id == campaign_id)
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def list_by_user(self, user_id: str, limit: int = 50, skip: int = 0) -> List[Campaign]:
        stmt = (
            select(CampaignModel)
            .options(
                selectinload(CampaignModel.rule),
                selectinload(CampaignModel.safety_policy),
                selectinload(CampaignModel.schedule),
            )
            .where(CampaignModel.user_id == user_id)
            .order_by(desc(CampaignModel.created_at))
            .offset(skip)
            .limit(limit)
        )
        res = await self._session.execute(stmt)
        models = res.scalars().all()
        return [self._to_domain(m) for m in models]

    async def save(self, campaign: Campaign) -> Campaign:
        stmt = (
            select(CampaignModel)
            .options(
                selectinload(CampaignModel.rule),
                selectinload(CampaignModel.safety_policy),
                selectinload(CampaignModel.schedule),
            )
            .where(CampaignModel.id == campaign.id)
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()

        if not model:
            model = CampaignModel(
                id=campaign.id,
                user_id=campaign.user_id,
                name=campaign.name,
                state=campaign.state,
                target_resume_id=campaign.target_resume_id,
                created_at=campaign.created_at,
                updated_at=campaign.updated_at,
            )
            self._session.add(model)
            await self._session.flush()

            # Rule
            rule_model = CampaignRuleModel(
                campaign_id=campaign.id,
                auto_apply_threshold=campaign.rule.auto_apply_threshold,
                review_threshold=campaign.rule.review_threshold,
                min_experience_years=campaign.rule.min_experience_years,
                max_experience_years=campaign.rule.max_experience_years,
                target_roles=campaign.rule.target_roles,
                target_locations=campaign.rule.target_locations,
                mandatory_skills=campaign.rule.mandatory_skills,
                excluded_keywords=campaign.rule.excluded_keywords,
                target_platforms=campaign.rule.target_platforms,
            )
            self._session.add(rule_model)

            # Safety
            safety_model = CampaignSafetyPolicyModel(
                campaign_id=campaign.id,
                daily_application_limit=campaign.safety_policy.daily_application_limit,
                hourly_application_limit=campaign.safety_policy.hourly_application_limit,
                cooldown_seconds=campaign.safety_policy.cooldown_seconds,
                operating_start_time=campaign.safety_policy.operating_start_time,
                operating_end_time=campaign.safety_policy.operating_end_time,
                max_concurrent_applications=campaign.safety_policy.max_concurrent_applications,
                timezone=campaign.safety_policy.timezone,
            )
            self._session.add(safety_model)

            # Schedule
            sched_model = CampaignScheduleModel(
                campaign_id=campaign.id,
                is_active=campaign.schedule.is_active,
                cron_expression=campaign.schedule.cron_expression,
                interval_minutes=campaign.schedule.interval_minutes,
                last_run_at=campaign.schedule.last_run_at,
                next_run_at=campaign.schedule.next_run_at,
            )
            self._session.add(sched_model)
        else:
            model.name = campaign.name
            model.state = campaign.state
            model.target_resume_id = campaign.target_resume_id
            model.updated_at = datetime.now(timezone.utc)

            if model.rule:
                model.rule.auto_apply_threshold = campaign.rule.auto_apply_threshold
                model.rule.review_threshold = campaign.rule.review_threshold
                model.rule.min_experience_years = campaign.rule.min_experience_years
                model.rule.max_experience_years = campaign.rule.max_experience_years
                model.rule.target_roles = campaign.rule.target_roles
                model.rule.target_locations = campaign.rule.target_locations
                model.rule.mandatory_skills = campaign.rule.mandatory_skills
                model.rule.excluded_keywords = campaign.rule.excluded_keywords
                model.rule.target_platforms = campaign.rule.target_platforms

            if model.safety_policy:
                model.safety_policy.daily_application_limit = campaign.safety_policy.daily_application_limit
                model.safety_policy.hourly_application_limit = campaign.safety_policy.hourly_application_limit
                model.safety_policy.cooldown_seconds = campaign.safety_policy.cooldown_seconds
                model.safety_policy.operating_start_time = campaign.safety_policy.operating_start_time
                model.safety_policy.operating_end_time = campaign.safety_policy.operating_end_time
                model.safety_policy.max_concurrent_applications = campaign.safety_policy.max_concurrent_applications
                model.safety_policy.timezone = campaign.safety_policy.timezone

            if model.schedule:
                model.schedule.is_active = campaign.schedule.is_active
                model.schedule.cron_expression = campaign.schedule.cron_expression
                model.schedule.interval_minutes = campaign.schedule.interval_minutes
                model.schedule.last_run_at = campaign.schedule.last_run_at
                model.schedule.next_run_at = campaign.schedule.next_run_at

        await self._session.commit()
        return await self.get_by_id(campaign.id)

    async def delete(self, campaign_id: str, user_id: str) -> bool:
        stmt = select(CampaignModel).where(CampaignModel.id == campaign_id, CampaignModel.user_id == user_id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        if not model:
            return False
        await self._session.delete(model)
        await self._session.commit()
        return True

    async def count_today_applications(self, campaign_id: str) -> int:
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        stmt = (
            select(func.count(CampaignJobItemModel.id))
            .join(CampaignExecutionModel, CampaignJobItemModel.execution_id == CampaignExecutionModel.id)
            .where(
                CampaignExecutionModel.campaign_id == campaign_id,
                CampaignJobItemModel.queue_status == "SUBMITTED",
                CampaignJobItemModel.processed_at >= today_start,
            )
        )
        res = await self._session.execute(stmt)
        return res.scalar_one() or 0

    async def count_hourly_applications(self, campaign_id: str) -> int:
        hour_start = datetime.now(timezone.utc) - timedelta(hours=1)
        stmt = (
            select(func.count(CampaignJobItemModel.id))
            .join(CampaignExecutionModel, CampaignJobItemModel.execution_id == CampaignExecutionModel.id)
            .where(
                CampaignExecutionModel.campaign_id == campaign_id,
                CampaignJobItemModel.queue_status == "SUBMITTED",
                CampaignJobItemModel.processed_at >= hour_start,
            )
        )
        res = await self._session.execute(stmt)
        return res.scalar_one() or 0


class SqlAlchemyCampaignExecutionRepository(CampaignExecutionRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_domain(self, model: CampaignExecutionModel) -> CampaignExecution:
        return CampaignExecution(
            id=model.id,
            campaign_id=model.campaign_id,
            user_id=model.user_id,
            status=model.status,
            worker_id=model.worker_id,
            heartbeat_at=model.heartbeat_at,
            lease_expires_at=model.lease_expires_at,
            lease_version=getattr(model, "lease_version", 1) or 1,
            started_at=model.started_at,
            completed_at=model.completed_at,
            discovered_count=model.discovered_count,
            qualified_count=model.qualified_count,
            queued_count=model.queued_count,
            submitted_count=model.submitted_count,
            failed_count=model.failed_count,
            error_message=model.error_message,
        )

    async def get_by_id(self, execution_id: str) -> Optional[CampaignExecution]:
        stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == execution_id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def get_active_by_campaign(self, campaign_id: str) -> Optional[CampaignExecution]:
        active_statuses = [
            "RUNNING",
            "INITIALIZING",
            "RECOVERY_PENDING",
            "PAUSED_OTP",
            "PAUSED_CAPTCHA",
            "PAUSED_SESSION",
            "PAUSED_LIMIT",
            "PAUSED_USER",
        ]
        stmt = (
            select(CampaignExecutionModel)
            .where(
                CampaignExecutionModel.campaign_id == campaign_id,
                CampaignExecutionModel.status.in_(active_statuses),
            )
            .order_by(desc(CampaignExecutionModel.started_at))
            .limit(1)
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def acquire_or_get_active_execution(
        self,
        campaign_id: str,
        user_id: str,
        worker_id: str = "worker-1",
        lease_seconds: int = 300,
        initial_status: str = "RUNNING",
    ) -> tuple[CampaignExecution, bool]:
        """Atomically acquires an execution lock for a campaign or returns the existing active execution."""
        import uuid
        now = datetime.now(timezone.utc)
        active_statuses = [
            "RUNNING",
            "INITIALIZING",
            "RECOVERY_PENDING",
            "PAUSED_OTP",
            "PAUSED_CAPTCHA",
            "PAUSED_SESSION",
            "PAUSED_LIMIT",
            "PAUSED_USER",
        ]

        stmt = (
            select(CampaignExecutionModel)
            .where(
                CampaignExecutionModel.campaign_id == campaign_id,
                CampaignExecutionModel.status.in_(active_statuses),
            )
            .order_by(desc(CampaignExecutionModel.started_at))
        )
        res = await self._session.execute(stmt)
        existing = res.scalars().first()

        if existing:
            # Case A: Existing execution is in RECOVERY_PENDING state (crashed worker recovered)
            if existing.status == "RECOVERY_PENDING":
                prev_worker = existing.worker_id
                existing.worker_id = worker_id
                existing.status = "RUNNING"
                existing.lease_version = (existing.lease_version or 1) + 1
                existing.heartbeat_at = now
                existing.lease_expires_at = now + timedelta(seconds=lease_seconds)
                existing.error_message = None
                log_model = CampaignActivityLogModel(
                    id=str(uuid.uuid4()),
                    execution_id=existing.id,
                    level="INFO",
                    event_type="RECOVERY_ACQUIRED",
                    message=f"Execution recovered and acquired by worker [{worker_id}] (v{existing.lease_version}).",
                    payload={
                        "previous_worker_id": prev_worker,
                        "new_worker_id": worker_id,
                        "lease_version": existing.lease_version,
                        "reacquired_at": now.isoformat(),
                    },
                    created_at=now,
                )
                self._session.add(log_model)
                await self._session.commit()
                return self._to_domain(existing), True

            # Case B: Lease expired (abandoned by an inactive/crashed worker)
            existing_lease_exp = (
                existing.lease_expires_at.replace(tzinfo=timezone.utc)
                if (existing.lease_expires_at and not existing.lease_expires_at.tzinfo)
                else existing.lease_expires_at
            )
            if existing_lease_exp and existing_lease_exp <= now:
                prev_worker = existing.worker_id
                existing.worker_id = worker_id
                existing.status = "RUNNING"
                existing.lease_version = (existing.lease_version or 1) + 1
                existing.heartbeat_at = now
                existing.lease_expires_at = now + timedelta(seconds=lease_seconds)
                existing.error_message = None
                log_model = CampaignActivityLogModel(
                    id=str(uuid.uuid4()),
                    execution_id=existing.id,
                    level="WARNING",
                    event_type="LEASE_TAKEOVER",
                    message=f"Worker [{worker_id}] took over expired execution [{existing.id}] from [{prev_worker}] (v{existing.lease_version}).",
                    payload={
                        "previous_worker_id": prev_worker,
                        "new_worker_id": worker_id,
                        "lease_version": existing.lease_version,
                        "reacquired_at": now.isoformat(),
                    },
                    created_at=now,
                )
                self._session.add(log_model)
                await self._session.commit()
                return self._to_domain(existing), True
            else:
                # Active, healthy execution exists. Return existing with was_created=False.
                await self._session.commit()
                return self._to_domain(existing), False

        # Create new execution with initial lease and lease_version=1
        new_exec = CampaignExecutionModel(
            id=f"cexec_{uuid.uuid4().hex[:12]}",
            campaign_id=campaign_id,
            user_id=user_id,
            status=initial_status,
            worker_id=worker_id,
            heartbeat_at=now,
            lease_expires_at=now + timedelta(seconds=lease_seconds),
            lease_version=1,
            started_at=now,
        )
        self._session.add(new_exec)
        try:
            await self._session.commit()
        except IntegrityError:
            # Lost a race: another request created the active execution between our check and insert
            # (the database refuses a second one, IMP-052). Return the winner instead of failing.
            await self._session.rollback()
            res = await self._session.execute(stmt)
            winner = res.scalars().first()
            if winner is None:
                raise
            return self._to_domain(winner), False
        return self._to_domain(new_exec), True

    async def record_heartbeat(
        self,
        execution_id: str,
        worker_id: str,
        lease_seconds: int = 300,
        lease_version: Optional[int] = None,
    ) -> Optional[CampaignExecution]:
        active_statuses = [
            "RUNNING",
            "INITIALIZING",
            "PAUSED_OTP",
            "PAUSED_CAPTCHA",
            "PAUSED_SESSION",
            "PAUSED_LIMIT",
            "PAUSED_USER",
        ]
        now = datetime.now(timezone.utc)
        new_expires_at = now + timedelta(seconds=lease_seconds)

        conditions = [
            CampaignExecutionModel.id == execution_id,
            CampaignExecutionModel.worker_id == worker_id,
            CampaignExecutionModel.status.in_(active_statuses),
        ]
        if lease_version is not None:
            conditions.append(CampaignExecutionModel.lease_version == lease_version)

        # Atomic conditional update in database
        upd_stmt = (
            update(CampaignExecutionModel)
            .where(*conditions)
            .values(
                heartbeat_at=now,
                lease_expires_at=new_expires_at,
                updated_at=now,
            )
        )
        res = await self._session.execute(upd_stmt)
        if res.rowcount == 0:
            logger.warning(
                f"Atomic heartbeat rejected for execution [{execution_id}]: "
                f"worker [{worker_id}] or lease_version [{lease_version}] mismatch or not renewable."
            )
            return None

        await self._session.commit()
        return await self.get_by_id(execution_id)

    async def reclaim_expired_leases(self, user_id: str | None = None) -> int:
        """Moves expired leases to RECOVERY_PENDING. With user_id, only that user's runs (AUT-20)."""
        import uuid
        now = datetime.now(timezone.utc)
        stmt = (
            select(CampaignExecutionModel)
            .where(
                CampaignExecutionModel.status.in_(["RUNNING", "INITIALIZING"]),
                CampaignExecutionModel.lease_expires_at <= now,
            )
        )
        if user_id is not None:
            stmt = stmt.where(CampaignExecutionModel.user_id == user_id)
        res = await self._session.execute(stmt)
        expired_models = res.scalars().all()
        reclaimed_count = 0
        for m in expired_models:
            current_ver = m.lease_version or 1
            # Atomic conditional update per row guaranteeing single-scheduler winner
            upd_stmt = (
                update(CampaignExecutionModel)
                .where(
                    CampaignExecutionModel.id == m.id,
                    CampaignExecutionModel.status.in_(["RUNNING", "INITIALIZING"]),
                    CampaignExecutionModel.lease_version == current_ver,
                )
                .values(
                    status="RECOVERY_PENDING",
                    lease_version=current_ver + 1,
                    error_message=f"Execution lease expired for worker [{m.worker_id}]. Awaiting recovery takeover.",
                    updated_at=now,
                )
            )
            upd_res = await self._session.execute(upd_stmt)
            if upd_res.rowcount > 0:
                reclaimed_count += 1
                log_model = CampaignActivityLogModel(
                    id=str(uuid.uuid4()),
                    execution_id=m.id,
                    level="WARNING",
                    event_type="LEASE_EXPIRED",
                    message=f"Execution lease expired for worker [{m.worker_id}]. Transitioned to RECOVERY_PENDING (v{current_ver + 1}).",
                    payload={
                        "worker_id": m.worker_id,
                        "lease_version": current_ver + 1,
                        "lease_expired_at": m.lease_expires_at.isoformat() if m.lease_expires_at else None,
                        "reclaimed_at": now.isoformat(),
                    },
                    created_at=now,
                )
                self._session.add(log_model)

        if reclaimed_count > 0:
            await self._session.commit()
        return reclaimed_count

    async def save(self, execution: CampaignExecution) -> CampaignExecution:
        stmt = select(CampaignExecutionModel).where(CampaignExecutionModel.id == execution.id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()

        if not model:
            model = CampaignExecutionModel(
                id=execution.id,
                campaign_id=execution.campaign_id,
                user_id=execution.user_id,
                status=execution.status,
                worker_id=execution.worker_id,
                heartbeat_at=execution.heartbeat_at,
                lease_expires_at=execution.lease_expires_at,
                lease_version=execution.lease_version or 1,
                started_at=execution.started_at,
                completed_at=execution.completed_at,
                discovered_count=execution.discovered_count,
                qualified_count=execution.qualified_count,
                queued_count=execution.queued_count,
                submitted_count=execution.submitted_count,
                failed_count=execution.failed_count,
                error_message=execution.error_message,
            )
            self._session.add(model)
            await self._session.commit()
            return self._to_domain(model)
        else:
            # Atomic conditional update enforcing that DB lease_version has not progressed past caller's version
            now = datetime.now(timezone.utc)
            incoming_ver = execution.lease_version or 1
            upd_stmt = (
                update(CampaignExecutionModel)
                .where(
                    CampaignExecutionModel.id == execution.id,
                    CampaignExecutionModel.lease_version <= incoming_ver,
                )
                .values(
                    status=execution.status,
                    worker_id=execution.worker_id or model.worker_id,
                    heartbeat_at=execution.heartbeat_at or model.heartbeat_at,
                    lease_expires_at=execution.lease_expires_at or model.lease_expires_at,
                    lease_version=max(incoming_ver, model.lease_version or 1),
                    completed_at=execution.completed_at,
                    discovered_count=execution.discovered_count,
                    qualified_count=execution.qualified_count,
                    queued_count=execution.queued_count,
                    submitted_count=execution.submitted_count,
                    failed_count=execution.failed_count,
                    error_message=execution.error_message,
                    updated_at=now,
                )
            )
            upd_res = await self._session.execute(upd_stmt)
            if upd_res.rowcount == 0:
                logger.warning(
                    f"Atomic fencing guard: rejecting save on execution [{execution.id}] "
                    f"due to stale lease_version {execution.lease_version} < DB version"
                )
                self._session.expire_all()
                fresh = await self._session.scalar(select(CampaignExecutionModel).where(CampaignExecutionModel.id == execution.id))
                return self._to_domain(fresh)

            await self._session.commit()
            return await self.get_by_id(execution.id)

    async def save_job_item(self, item: CampaignJobItem) -> CampaignJobItem:
        stmt = select(CampaignJobItemModel).where(CampaignJobItemModel.id == item.id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()

        if not model:
            model = CampaignJobItemModel(
                id=item.id,
                execution_id=item.execution_id,
                job_id=item.job_id,
                match_score=item.match_score,
                decision=item.decision,
                queue_status=item.queue_status,
                retry_count=item.retry_count,
                error_category=item.error_category,
                next_retry_at=item.next_retry_at,
                last_error=item.last_error,
                failure_reason=item.failure_reason,
                processed_at=item.processed_at,
            )
            self._session.add(model)
        else:
            model.match_score = item.match_score
            model.decision = item.decision
            model.queue_status = item.queue_status
            model.retry_count = item.retry_count
            model.error_category = item.error_category
            model.next_retry_at = item.next_retry_at
            model.last_error = item.last_error
            model.failure_reason = item.failure_reason
            model.processed_at = item.processed_at

        await self._session.commit()
        return item

    async def list_job_items(self, execution_id: str, limit: int = 50) -> List[CampaignJobItem]:
        stmt = (
            select(CampaignJobItemModel)
            .where(CampaignJobItemModel.execution_id == execution_id)
            .order_by(desc(CampaignJobItemModel.match_score))
            .limit(limit)
        )
        res = await self._session.execute(stmt)
        models = res.scalars().all()
        return [
            CampaignJobItem(
                id=m.id,
                execution_id=m.execution_id,
                job_id=m.job_id,
                match_score=m.match_score,
                decision=m.decision,
                queue_status=m.queue_status,
                failure_reason=m.failure_reason,
                retry_count=m.retry_count or 0,
                error_category=m.error_category,
                next_retry_at=m.next_retry_at,
                last_error=m.last_error,
                processed_at=m.processed_at,
            )
            for m in models
        ]


class SqlAlchemyCampaignActivityLogRepository(CampaignActivityLogRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def log(self, log_entry: CampaignActivityLog) -> CampaignActivityLog:
        model = CampaignActivityLogModel(
            id=log_entry.id,
            execution_id=log_entry.execution_id,
            level=log_entry.level,
            event_type=log_entry.event_type,
            message=log_entry.message,
            payload=log_entry.metadata,
            created_at=log_entry.created_at,
        )
        self._session.add(model)
        await self._session.commit()
        return log_entry

    async def list_logs(self, execution_id: str, limit: int = 100) -> List[CampaignActivityLog]:
        stmt = (
            select(CampaignActivityLogModel)
            .where(CampaignActivityLogModel.execution_id == execution_id)
            .order_by(desc(CampaignActivityLogModel.created_at))
            .limit(limit)
        )
        res = await self._session.execute(stmt)
        models = res.scalars().all()
        return [
            CampaignActivityLog(
                id=m.id,
                execution_id=m.execution_id,
                level=m.level,
                event_type=m.event_type,
                message=m.message,
                metadata=m.payload or {},
                created_at=m.created_at,
            )
            for m in models
        ]


class SqlAlchemyQuotaReservationRepository(QuotaReservationRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_domain(self, model: QuotaReservationModel) -> QuotaReservation:
        return QuotaReservation(
            id=model.id,
            campaign_id=model.campaign_id,
            user_id=model.user_id,
            execution_id=model.execution_id,
            job_id=model.job_id,
            status=QuotaReservationStatus(model.status),
            reserved_at=model.reserved_at,
            expires_at=model.expires_at,
            consumed_at=model.consumed_at,
            released_at=model.released_at,
        )

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
        import uuid
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        hour_start = datetime(now.year, now.month, now.day, now.hour, tzinfo=timezone.utc)

        # 1. Count consumed applications today via CampaignJobItemModel OR QuotaReservationModel(status="CONSUMED")
        stmt_sub_today = (
            select(func.count(CampaignJobItemModel.id))
            .join(CampaignExecutionModel, CampaignJobItemModel.execution_id == CampaignExecutionModel.id)
            .where(
                CampaignExecutionModel.campaign_id == campaign_id,
                CampaignJobItemModel.queue_status == "SUBMITTED",
                CampaignJobItemModel.processed_at >= today_start,
            )
        )
        sub_today = (await self._session.execute(stmt_sub_today)).scalar_one() or 0

        stmt_consumed_res = (
            select(func.count(QuotaReservationModel.id))
            .where(
                QuotaReservationModel.campaign_id == campaign_id,
                QuotaReservationModel.status == "CONSUMED",
                QuotaReservationModel.consumed_at >= today_start,
            )
        )
        consumed_res_today = (await self._session.execute(stmt_consumed_res)).scalar_one() or 0
        total_consumed_today = max(sub_today, consumed_res_today)

        # 2. Count active pending reservations today (status == RESERVED and expires_at > now)
        stmt_res_today = (
            select(func.count(QuotaReservationModel.id))
            .where(
                QuotaReservationModel.campaign_id == campaign_id,
                QuotaReservationModel.status == "RESERVED",
                QuotaReservationModel.expires_at > now,
            )
        )
        res_today = (await self._session.execute(stmt_res_today)).scalar_one() or 0

        if (total_consumed_today + res_today) >= daily_limit:
            logger.info(
                f"Atomic quota reservation rejected: daily limit ({daily_limit}) reached "
                f"({total_consumed_today} consumed + {res_today} active reservations)."
            )
            return None

        # 3. Check hourly limits if configured
        if hourly_limit is not None:
            stmt_sub_hour = (
                select(func.count(CampaignJobItemModel.id))
                .join(CampaignExecutionModel, CampaignJobItemModel.execution_id == CampaignExecutionModel.id)
                .where(
                    CampaignExecutionModel.campaign_id == campaign_id,
                    CampaignJobItemModel.queue_status == "SUBMITTED",
                    CampaignJobItemModel.processed_at >= hour_start,
                )
            )
            sub_hour = (await self._session.execute(stmt_sub_hour)).scalar_one() or 0

            stmt_consumed_hour = (
                select(func.count(QuotaReservationModel.id))
                .where(
                    QuotaReservationModel.campaign_id == campaign_id,
                    QuotaReservationModel.status == "CONSUMED",
                    QuotaReservationModel.consumed_at >= hour_start,
                )
            )
            consumed_res_hour = (await self._session.execute(stmt_consumed_hour)).scalar_one() or 0
            total_consumed_hour = max(sub_hour, consumed_res_hour)

            stmt_res_hour = (
                select(func.count(QuotaReservationModel.id))
                .where(
                    QuotaReservationModel.campaign_id == campaign_id,
                    QuotaReservationModel.status == "RESERVED",
                    QuotaReservationModel.reserved_at >= hour_start,
                    QuotaReservationModel.expires_at > now,
                )
            )
            res_hour = (await self._session.execute(stmt_res_hour)).scalar_one() or 0

            if (total_consumed_hour + res_hour) >= hourly_limit:
                logger.info(
                    f"Atomic quota reservation rejected: hourly limit ({hourly_limit}) reached "
                    f"({total_consumed_hour} consumed + {res_hour} active reservations)."
                )
                return None

        # 4. Resolve active execution if execution_id not provided
        resolved_exec_id = execution_id
        if not resolved_exec_id and campaign_id:
            stmt_active_exec = (
                select(CampaignExecutionModel.id)
                .where(
                    CampaignExecutionModel.campaign_id == campaign_id,
                    CampaignExecutionModel.status.in_(["RUNNING", "INITIALIZING", "PAUSED_OTP", "PAUSED_CAPTCHA", "PAUSED_LIMIT", "PAUSED_SESSION", "PAUSED_USER"]),
                )
                .order_by(desc(CampaignExecutionModel.started_at))
                .limit(1)
            )
            exec_res = await self._session.execute(stmt_active_exec)
            resolved_exec_id = exec_res.scalar_one_or_none()

        # 5. Atomically insert reservation
        res_model = QuotaReservationModel(
            id=f"qres_{uuid.uuid4().hex[:12]}",
            campaign_id=campaign_id,
            user_id=user_id,
            execution_id=resolved_exec_id,
            job_id=job_id,
            status="RESERVED",
            reserved_at=now,
            expires_at=now + timedelta(seconds=ttl_seconds),
        )
        self._session.add(res_model)
        try:
            await self._session.commit()
            return self._to_domain(res_model)
        except Exception as e:
            await self._session.rollback()
            logger.warning(f"Failed to reserve quota slot for job [{job_id}]: {e}")
            return None

    async def consume_slot(self, reservation_id: str) -> bool:
        now = datetime.now(timezone.utc)
        stmt = (
            update(QuotaReservationModel)
            .where(
                QuotaReservationModel.id == reservation_id,
                QuotaReservationModel.status == "RESERVED",
            )
            .values(status="CONSUMED", consumed_at=now)
        )
        res = await self._session.execute(stmt)
        await self._session.commit()
        return res.rowcount > 0

    async def release_slot(self, reservation_id: str) -> bool:
        now = datetime.now(timezone.utc)
        stmt = (
            update(QuotaReservationModel)
            .where(
                QuotaReservationModel.id == reservation_id,
                QuotaReservationModel.status == "RESERVED",
            )
            .values(status="RELEASED", released_at=now)
        )
        res = await self._session.execute(stmt)
        await self._session.commit()
        return res.rowcount > 0

    async def get_by_id(self, reservation_id: str) -> Optional[QuotaReservation]:
        stmt = select(QuotaReservationModel).where(QuotaReservationModel.id == reservation_id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def count_active_reservations_today(self, campaign_id: str) -> int:
        now = datetime.now(timezone.utc)
        stmt = (
            select(func.count(QuotaReservationModel.id))
            .where(
                QuotaReservationModel.campaign_id == campaign_id,
                QuotaReservationModel.status == "RESERVED",
                QuotaReservationModel.expires_at > now,
            )
        )
        res = await self._session.execute(stmt)
        return res.scalar_one() or 0
