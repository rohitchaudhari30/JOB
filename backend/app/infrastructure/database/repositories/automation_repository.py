import logging
from typing import List, Optional
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.automation.entities import AutomationRun
from app.domain.automation.repositories import AutomationRunRepository
from app.domain.automation.state_machine import AutomationState
from app.infrastructure.database.models.models import AutomationEventModel, AutomationRunModel

logger = logging.getLogger("app.repositories.automation")


class SqlAlchemyAutomationRunRepository(AutomationRunRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_domain(self, model: AutomationRunModel) -> AutomationRun:
        status = AutomationState(model.status) if model.status in AutomationState._value2member_map_ else AutomationState.CREATED
        return AutomationRun(
            id=model.id,
            user_id=model.user_id,
            status=status,
            source_type=model.source_type,
            target_count=model.target_count,
            discovered_count=model.discovered_count,
            matched_count=model.matched_count,
            applied_count=model.applied_count,
            failed_count=model.failed_count,
            current_job_id=model.current_job_id,
            current_job_title=model.current_job_title,
            worker_id=model.worker_id,
            error_message=model.error_message,
            started_at=model.started_at,
            finished_at=model.finished_at,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def get_by_id(self, run_id: str) -> Optional[AutomationRun]:
        stmt = select(AutomationRunModel).where(AutomationRunModel.id == run_id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def get_active_run_for_user(self, user_id: str) -> Optional[AutomationRun]:
        active_statuses = [
            AutomationState.CREATED.value,
            AutomationState.STARTING.value,
            AutomationState.RUNNING.value,
            AutomationState.PAUSED.value,
            AutomationState.STOPPING.value,
        ]
        stmt = (
            select(AutomationRunModel)
            .where(
                AutomationRunModel.user_id == user_id,
                AutomationRunModel.status.in_(active_statuses),
            )
            .order_by(desc(AutomationRunModel.created_at))
            .limit(1)
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_domain(model) if model else None

    async def list_by_user_id(self, user_id: str, limit: int = 50) -> List[AutomationRun]:
        stmt = (
            select(AutomationRunModel)
            .where(AutomationRunModel.user_id == user_id)
            .order_by(desc(AutomationRunModel.created_at))
            .limit(limit)
        )
        res = await self._session.execute(stmt)
        models = res.scalars().all()
        return [self._to_domain(m) for m in models]

    async def create(self, run: AutomationRun) -> AutomationRun:
        model = AutomationRunModel(
            id=run.id,
            user_id=run.user_id,
            status=run.status.value,
            source_type=run.source_type,
            target_count=run.target_count,
            discovered_count=run.discovered_count,
            matched_count=run.matched_count,
            applied_count=run.applied_count,
            failed_count=run.failed_count,
            current_job_id=run.current_job_id,
            current_job_title=run.current_job_title,
            worker_id=run.worker_id,
            error_message=run.error_message,
            started_at=run.started_at,
            finished_at=run.finished_at,
            created_at=run.created_at,
            updated_at=run.updated_at,
        )
        self._session.add(model)
        await self._session.commit()
        await self._session.refresh(model)
        return self._to_domain(model)

    async def update(self, run: AutomationRun) -> AutomationRun:
        stmt = select(AutomationRunModel).where(AutomationRunModel.id == run.id)
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        if not model:
            return await self.create(run)

        model.status = run.status.value
        model.discovered_count = run.discovered_count
        model.matched_count = run.matched_count
        model.applied_count = run.applied_count
        model.failed_count = run.failed_count
        model.current_job_id = run.current_job_id
        model.current_job_title = run.current_job_title
        model.error_message = run.error_message
        model.finished_at = run.finished_at
        model.updated_at = run.updated_at

        await self._session.commit()
        await self._session.refresh(model)
        return self._to_domain(model)

    async def record_event(self, run_id: str, event_name: str, payload: dict) -> None:
        event = AutomationEventModel(
            run_id=run_id,
            event_name=event_name,
            payload=payload,
        )
        self._session.add(event)
        await self._session.commit()


    # --- Read helpers used by the API (ARC-02). They return stored rows as they are. ---

    async def get_row(self, run_id: str) -> Optional[AutomationRunModel]:
        return await self._session.scalar(select(AutomationRunModel).where(AutomationRunModel.id == run_id))

    async def get_latest_active_row(self, user_id: str) -> Optional[AutomationRunModel]:
        stmt = (
            select(AutomationRunModel)
            .where(
                AutomationRunModel.user_id == user_id,
                AutomationRunModel.status.in_(["RUNNING", "STARTING", "PAUSED"]),
            )
            .order_by(desc(AutomationRunModel.created_at))
            .limit(1)
        )
        return await self._session.scalar(stmt)

    async def list_event_rows(self, run_id: str, after_seq: Optional[int], limit: int) -> List[AutomationEventModel]:
        stmt = select(AutomationEventModel).where(AutomationEventModel.run_id == run_id)
        if after_seq is not None:
            stmt = stmt.where(AutomationEventModel.seq > after_seq)
        stmt = stmt.order_by(AutomationEventModel.seq.asc()).limit(limit)
        return list((await self._session.scalars(stmt)).all())
