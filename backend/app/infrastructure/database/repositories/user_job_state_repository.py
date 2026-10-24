from datetime import datetime, timezone
from typing import Dict, List, Optional
import uuid
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.jobs.entities import Job, UserJobState
from app.domain.jobs.repositories import UserJobStateRepository
from app.infrastructure.database.models.models import JobModel, UserJobStateModel
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository


class SqlAlchemyUserJobStateRepository(UserJobStateRepository):
    def __init__(self, session: AsyncSession):
        self._session = session
        self._job_repo = SqlAlchemyJobRepository(session)

    def _to_entity(self, model: UserJobStateModel) -> UserJobState:
        return UserJobState(
            id=model.id,
            user_id=model.user_id,
            job_id=model.job_id,
            is_saved=model.is_saved,
            is_dismissed=model.is_dismissed,
            saved_at=model.saved_at,
            dismissed_at=model.dismissed_at,
            notes=model.notes,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def get_state(self, user_id: str, job_id: str) -> Optional[UserJobState]:
        stmt = select(UserJobStateModel).where(
            UserJobStateModel.user_id == user_id,
            UserJobStateModel.job_id == job_id,
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def set_saved(
        self,
        user_id: str,
        job_id: str,
        is_saved: bool,
        notes: Optional[str] = None,
    ) -> UserJobState:
        now = datetime.now(timezone.utc)
        stmt = select(UserJobStateModel).where(
            UserJobStateModel.user_id == user_id,
            UserJobStateModel.job_id == job_id,
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()

        if not model:
            model = UserJobStateModel(
                id=str(uuid.uuid4()),
                user_id=user_id,
                job_id=job_id,
                is_saved=is_saved,
                is_dismissed=False,
                saved_at=now if is_saved else None,
                notes=notes,
                created_at=now,
                updated_at=now,
            )
            self._session.add(model)
        else:
            model.is_saved = is_saved
            if is_saved and not model.saved_at:
                model.saved_at = now
            elif not is_saved:
                model.saved_at = None
            if notes is not None:
                model.notes = notes
            model.updated_at = now

        await self._session.flush()
        return self._to_entity(model)

    async def set_dismissed(self, user_id: str, job_id: str, is_dismissed: bool) -> UserJobState:
        now = datetime.now(timezone.utc)
        stmt = select(UserJobStateModel).where(
            UserJobStateModel.user_id == user_id,
            UserJobStateModel.job_id == job_id,
        )
        res = await self._session.execute(stmt)
        model = res.scalar_one_or_none()

        if not model:
            model = UserJobStateModel(
                id=str(uuid.uuid4()),
                user_id=user_id,
                job_id=job_id,
                is_saved=False,
                is_dismissed=is_dismissed,
                dismissed_at=now if is_dismissed else None,
                created_at=now,
                updated_at=now,
            )
            self._session.add(model)
        else:
            model.is_dismissed = is_dismissed
            model.dismissed_at = now if is_dismissed else None
            model.updated_at = now

        await self._session.flush()
        return self._to_entity(model)

    async def list_saved_jobs(self, user_id: str, skip: int = 0, limit: int = 50) -> List[Job]:
        stmt = (
            select(JobModel)
            .join(UserJobStateModel, UserJobStateModel.job_id == JobModel.id)
            .options(selectinload(JobModel.source))
            .where(
                UserJobStateModel.user_id == user_id,
                UserJobStateModel.is_saved == True,
            )
            .order_by(UserJobStateModel.saved_at.desc().nullslast(), JobModel.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        res = await self._session.execute(stmt)
        job_models = res.scalars().all()
        return [self._job_repo._to_entity(m) for m in job_models]

    async def list_dismissed_job_ids(self, user_id: str) -> List[str]:
        stmt = select(UserJobStateModel.job_id).where(
            UserJobStateModel.user_id == user_id,
            UserJobStateModel.is_dismissed == True,
        )
        res = await self._session.execute(stmt)
        return [r[0] for r in res.fetchall()]

    async def get_user_states_for_jobs(self, user_id: str, job_ids: List[str]) -> Dict[str, UserJobState]:
        if not job_ids:
            return {}
        stmt = select(UserJobStateModel).where(
            UserJobStateModel.user_id == user_id,
            UserJobStateModel.job_id.in_(job_ids),
        )
        res = await self._session.execute(stmt)
        models = res.scalars().all()
        return {m.job_id: self._to_entity(m) for m in models}
