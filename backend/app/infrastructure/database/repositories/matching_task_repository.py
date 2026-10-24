from datetime import datetime, timezone, timedelta
import logging
from typing import Optional
import uuid
from sqlalchemy import func, select, update, or_, and_
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.matching.entities import (
    MatchingTask,
    MatchingTaskStatus,
)
from app.domain.matching.repositories import MatchingTaskRepository
from app.infrastructure.database.models.models import MatchingTaskModel

logger = logging.getLogger("app.infrastructure.matching_task_repository")


class SqlAlchemyMatchingTaskRepository(MatchingTaskRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: MatchingTaskModel) -> MatchingTask:
        return MatchingTask(
            id=model.id,
            user_id=model.user_id,
            job_id=model.job_id,
            task_idempotency_key=model.task_idempotency_key,
            campaign_id=model.campaign_id,
            resume_id=model.resume_id,
            status=MatchingTaskStatus(model.status),
            attempt_count=model.attempt_count,
            max_attempts=model.max_attempts,
            worker_id=model.worker_id,
            lease_version=model.lease_version,
            leased_at=model.leased_at,
            lease_expires_at=model.lease_expires_at,
            last_error=model.last_error,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def enqueue_task(
        self,
        user_id: str,
        job_id: str,
        task_idempotency_key: str,
        campaign_id: Optional[str] = None,
        resume_id: Optional[str] = None,
    ) -> MatchingTask:
        stmt = select(MatchingTaskModel).where(
            MatchingTaskModel.user_id == user_id,
            MatchingTaskModel.job_id == job_id,
            MatchingTaskModel.task_idempotency_key == task_idempotency_key,
        )
        res = await self._session.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            if existing.status in (MatchingTaskStatus.QUEUED.value, MatchingTaskStatus.LEASED.value):
                return self._to_entity(existing)
            existing.status = MatchingTaskStatus.QUEUED.value
            existing.attempt_count = 0
            existing.last_error = None
            existing.updated_at = datetime.now(timezone.utc)
            await self._session.flush()
            return self._to_entity(existing)

        new_model = MatchingTaskModel(
            id=f"mtask_{uuid.uuid4().hex[:12]}",
            user_id=user_id,
            job_id=job_id,
            campaign_id=campaign_id,
            resume_id=resume_id,
            task_idempotency_key=task_idempotency_key,
            status=MatchingTaskStatus.QUEUED.value,
            attempt_count=0,
            max_attempts=3,
            lease_version=1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        self._session.add(new_model)
        await self._session.flush()
        return self._to_entity(new_model)

    async def claim_next_task(
        self,
        worker_id: str,
        lease_seconds: int = 120,
    ) -> Optional[MatchingTask]:
        now = datetime.now(timezone.utc)
        bind = self._session.bind
        dialect_name = bind.dialect.name if bind else "sqlite"

        if dialect_name == "postgresql":
            # PostgreSQL Production Strategy: Atomic SELECT FOR UPDATE SKIP LOCKED
            stmt = (
                select(MatchingTaskModel)
                .where(
                    or_(
                        MatchingTaskModel.status == MatchingTaskStatus.QUEUED.value,
                        and_(
                            MatchingTaskModel.status == MatchingTaskStatus.LEASED.value,
                            MatchingTaskModel.lease_expires_at < now,
                        ),
                    )
                )
                .order_by(MatchingTaskModel.created_at.asc())
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            res = await self._session.execute(stmt)
            task_model = res.scalar_one_or_none()
            if not task_model:
                return None

            task_model.status = MatchingTaskStatus.LEASED.value
            task_model.worker_id = worker_id
            task_model.lease_version += 1
            task_model.leased_at = now
            task_model.lease_expires_at = now + timedelta(seconds=lease_seconds)
            task_model.attempt_count += 1
            task_model.updated_at = now
            await self._session.flush()
            return self._to_entity(task_model)
        else:
            # SQLite Strategy: Transactional conditional lease update
            candidate_stmt = (
                select(MatchingTaskModel.id, MatchingTaskModel.lease_version)
                .where(
                    or_(
                        MatchingTaskModel.status == MatchingTaskStatus.QUEUED.value,
                        and_(
                            MatchingTaskModel.status == MatchingTaskStatus.LEASED.value,
                            MatchingTaskModel.lease_expires_at < now,
                        ),
                    )
                )
                .order_by(MatchingTaskModel.created_at.asc())
                .limit(1)
            )
            candidate_res = await self._session.execute(candidate_stmt)
            candidate_row = candidate_res.first()
            if not candidate_row:
                return None

            cand_id, current_ver = candidate_row
            upd_stmt = (
                update(MatchingTaskModel)
                .where(
                    MatchingTaskModel.id == cand_id,
                    MatchingTaskModel.lease_version == current_ver,
                )
                .values(
                    status=MatchingTaskStatus.LEASED.value,
                    worker_id=worker_id,
                    lease_version=current_ver + 1,
                    leased_at=now,
                    lease_expires_at=now + timedelta(seconds=lease_seconds),
                    attempt_count=MatchingTaskModel.attempt_count + 1,
                    updated_at=now,
                )
            )
            try:
                upd_res = await self._session.execute(upd_stmt)
                if upd_res.rowcount == 0:
                    # Concurrently claimed by another worker
                    return None

                task_model = await self._session.get(MatchingTaskModel, cand_id)
                return self._to_entity(task_model) if task_model else None
            except OperationalError as oe:
                if "locked" in str(oe).lower() or "busy" in str(oe).lower():
                    # Concurrently locked/claimed by another worker in SQLite
                    return None
                raise

    async def complete_task(self, task_id: str, worker_id: str, lease_version: int) -> bool:
        now = datetime.now(timezone.utc)
        stmt = (
            update(MatchingTaskModel)
            .where(
                MatchingTaskModel.id == task_id,
                MatchingTaskModel.worker_id == worker_id,
                MatchingTaskModel.lease_version == lease_version,
            )
            .values(
                status=MatchingTaskStatus.COMPLETED.value,
                updated_at=now,
            )
        )
        res = await self._session.execute(stmt)
        await self._session.flush()
        return res.rowcount > 0

    async def fail_task(
        self,
        task_id: str,
        worker_id: str,
        lease_version: int,
        error_message: str,
        retryable: bool = True,
    ) -> bool:
        now = datetime.now(timezone.utc)
        task = await self._session.get(MatchingTaskModel, task_id)
        if not task:
            return False

        next_status = (
            MatchingTaskStatus.QUEUED.value
            if retryable and task.attempt_count < task.max_attempts
            else MatchingTaskStatus.FAILED.value
        )

        stmt = (
            update(MatchingTaskModel)
            .where(
                MatchingTaskModel.id == task_id,
                MatchingTaskModel.worker_id == worker_id,
                MatchingTaskModel.lease_version == lease_version,
            )
            .values(
                status=next_status,
                last_error=error_message,
                lease_expires_at=None if next_status == MatchingTaskStatus.QUEUED.value else task.lease_expires_at,
                updated_at=now,
            )
        )
        res = await self._session.execute(stmt)
        await self._session.flush()
        return res.rowcount > 0

    async def get_by_id(self, task_id: str) -> Optional[MatchingTask]:
        model = await self._session.get(MatchingTaskModel, task_id)
        return self._to_entity(model) if model else None

    async def count_pending_tasks(self, user_id: Optional[str] = None) -> int:
        stmt = select(func.count(MatchingTaskModel.id)).where(
            MatchingTaskModel.status.in_([MatchingTaskStatus.QUEUED.value, MatchingTaskStatus.LEASED.value])
        )
        if user_id:
            stmt = stmt.where(MatchingTaskModel.user_id == user_id)
        return (await self._session.execute(stmt)).scalar_one() or 0
