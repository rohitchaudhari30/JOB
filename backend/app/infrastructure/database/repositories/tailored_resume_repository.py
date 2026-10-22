from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.resume_tailoring.entities import ConfirmedFactRecord, TailoredResume
from app.domain.resume_tailoring.ports import ConfirmedFactRepository, TailoredResumeRepository
from app.domain.resume_tailoring.rules import normalize
from app.domain.resume_tailoring.status import IN_FLIGHT, TailoringStatus
from app.infrastructure.database.models.models import (
    ApplicationModel,
    ResumeConfirmedFactModel,
    TailoredResumeModel,
)

_FIELDS = [
    "id", "user_id", "master_resume_id", "master_file_hash", "job_id", "job_description_hash", "input_hash", "mode",
    "version", "master_label_snapshot", "job_title_snapshot", "company_snapshot", "analysis", "edit_plan",
    "approved_edit_ids", "validation", "file_path", "pdf_file_path", "file_name", "file_hash", "provider", "model_name",
    "prompt_version", "error_code", "error_message", "attempt_count", "lease_owner", "lease_expires_at", "created_at",
    "updated_at", "approved_at", "expires_at",
]
_ACTIVE_APPLICATION_STATES = (
    "APPROVED", "QUEUED", "APPLYING", "FORM_DETECTED", "FORM_FILLED", "SUBMITTING", "PAUSED_OTP", "PAUSED_CAPTCHA",
    "PAUSED_USER_INPUT", "RECONCILIATION_REQUIRED",
)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class SqlAlchemyTailoredResumeRepository(TailoredResumeRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    @staticmethod
    def _to_entity(m: TailoredResumeModel) -> TailoredResume:
        data = {name: getattr(m, name) for name in _FIELDS}
        for key in ("lease_expires_at", "created_at", "updated_at", "approved_at", "expires_at"):
            data[key] = _aware(data[key])
        return TailoredResume(status=TailoringStatus(m.status), **data)

    @staticmethod
    def _copy_to_model(item: TailoredResume, m: TailoredResumeModel) -> None:
        for name in _FIELDS:
            if name in ("id", "user_id", "created_at"):
                continue
            setattr(m, name, getattr(item, name))
        m.status = item.status.value

    async def get(self, tailored_id: str) -> Optional[TailoredResume]:
        m = await self._session.get(TailoredResumeModel, tailored_id)
        if m is not None:
            await self._session.refresh(m)
        return self._to_entity(m) if m else None

    async def create(self, item: TailoredResume) -> TailoredResume:
        m = TailoredResumeModel(id=item.id, user_id=item.user_id, created_at=item.created_at)
        self._copy_to_model(item, m)
        try:
            async with self._session.begin_nested():
                self._session.add(m)
                await self._session.flush()
        except IntegrityError:
            existing = await self.find_in_flight(item.user_id, item.master_resume_id or "", item.job_id)
            if existing:
                return existing
            raise
        return self._to_entity(m)

    async def save(self, item: TailoredResume) -> TailoredResume:
        m = await self._session.get(TailoredResumeModel, item.id)
        if m is None:
            raise ValueError("Tailored resume not found.")
        self._copy_to_model(item, m)
        await self._session.flush()
        await self._session.refresh(m)
        return self._to_entity(m)

    async def find_in_flight(self, user_id: str, master_resume_id: str, job_id: str) -> Optional[TailoredResume]:
        stmt = select(TailoredResumeModel).where(
            TailoredResumeModel.user_id == user_id,
            TailoredResumeModel.master_resume_id == master_resume_id,
            TailoredResumeModel.job_id == job_id,
            TailoredResumeModel.status.in_([s.value for s in IN_FLIGHT]),
        )
        m = (await self._session.execute(stmt)).scalars().first()
        return self._to_entity(m) if m else None

    async def find_reusable(self, user_id: str, input_hash: str) -> Optional[TailoredResume]:
        stmt = (
            select(TailoredResumeModel)
            .where(
                TailoredResumeModel.user_id == user_id,
                TailoredResumeModel.input_hash == input_hash,
                TailoredResumeModel.status.in_([TailoringStatus.READY_FOR_REVIEW.value, TailoringStatus.SAVED.value]),
            )
            .order_by(TailoredResumeModel.created_at.desc())
        )
        m = (await self._session.execute(stmt)).scalars().first()
        return self._to_entity(m) if m else None

    async def list_for_job(self, user_id: str, job_id: str) -> List[TailoredResume]:
        stmt = (
            select(TailoredResumeModel)
            .where(TailoredResumeModel.user_id == user_id, TailoredResumeModel.job_id == job_id)
            .order_by(TailoredResumeModel.created_at.desc())
        )
        return [self._to_entity(m) for m in (await self._session.execute(stmt)).scalars().all()]

    async def list_saved(self, user_id: str) -> List[TailoredResume]:
        stmt = (
            select(TailoredResumeModel)
            .where(TailoredResumeModel.user_id == user_id, TailoredResumeModel.status == "SAVED")
            .order_by(TailoredResumeModel.approved_at.desc())
        )
        return [self._to_entity(m) for m in (await self._session.execute(stmt)).scalars().all()]

    async def next_version(self, user_id: str, master_resume_id: str, job_id: str) -> int:
        stmt = select(func.max(TailoredResumeModel.version)).where(
            TailoredResumeModel.user_id == user_id,
            TailoredResumeModel.master_resume_id == master_resume_id,
            TailoredResumeModel.job_id == job_id,
        )
        return int((await self._session.execute(stmt)).scalar() or 0) + 1

    async def claim_next(self, worker_id: str, lease_seconds: int) -> Optional[Tuple[TailoredResume, str]]:
        now = datetime.now(timezone.utc)
        waiting = (TailoringStatus.QUEUED.value, TailoringStatus.GENERATE_QUEUED.value)
        working = (TailoringStatus.ANALYZING.value, TailoringStatus.GENERATING.value)
        stmt = (
            select(TailoredResumeModel)
            .where(
                or_(
                    TailoredResumeModel.status.in_(waiting),
                    and_(TailoredResumeModel.status.in_(working), TailoredResumeModel.lease_expires_at < now),
                )
            )
            .order_by(TailoredResumeModel.created_at.asc())
            .limit(1)
        )
        candidate = (await self._session.execute(stmt)).scalars().first()
        if candidate is None:
            return None
        observed_status = candidate.status
        stage = "analyze" if observed_status in (TailoringStatus.QUEUED.value, TailoringStatus.ANALYZING.value) else "generate"
        new_status = TailoringStatus.ANALYZING.value if stage == "analyze" else TailoringStatus.GENERATING.value
        result = await self._session.execute(
            update(TailoredResumeModel)
            .where(TailoredResumeModel.id == candidate.id, TailoredResumeModel.status == observed_status)
            .values(
                status=new_status,
                lease_owner=worker_id,
                lease_expires_at=now + timedelta(seconds=lease_seconds),
                attempt_count=TailoredResumeModel.attempt_count + 1,
                updated_at=now,
            )
        )
        if result.rowcount != 1:
            return None  # another worker took it first
        await self._session.flush()
        await self._session.refresh(candidate)
        return self._to_entity(candidate), stage

    async def list_expired_drafts(self, now: datetime, limit: int = 50) -> List[TailoredResume]:
        stmt = (
            select(TailoredResumeModel)
            .where(
                TailoredResumeModel.expires_at.is_not(None),
                TailoredResumeModel.expires_at < now,
                TailoredResumeModel.status != TailoringStatus.SAVED.value,
                TailoredResumeModel.status != TailoringStatus.DISCARDED.value,
            )
            .limit(limit)
        )
        return [self._to_entity(m) for m in (await self._session.execute(stmt)).scalars().all()]

    async def count_active_applications_using(self, tailored_id: str) -> int:
        stmt = select(func.count()).select_from(ApplicationModel).where(
            ApplicationModel.tailored_resume_id == tailored_id,
            ApplicationModel.workflow_state.in_(_ACTIVE_APPLICATION_STATES),
        )
        return int((await self._session.execute(stmt)).scalar() or 0)


class SqlAlchemyConfirmedFactRepository(ConfirmedFactRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    @staticmethod
    def _to_entity(m: ResumeConfirmedFactModel) -> ConfirmedFactRecord:
        return ConfirmedFactRecord(
            id=m.id, user_id=m.user_id, master_resume_id=m.master_resume_id, term=m.term,
            details=m.details, source=m.source, created_at=_aware(m.created_at),
        )

    async def list_for_master(self, user_id: str, master_resume_id: str) -> List[ConfirmedFactRecord]:
        stmt = select(ResumeConfirmedFactModel).where(
            ResumeConfirmedFactModel.user_id == user_id,
            ResumeConfirmedFactModel.master_resume_id == master_resume_id,
        ).order_by(ResumeConfirmedFactModel.created_at.asc())
        return [self._to_entity(m) for m in (await self._session.execute(stmt)).scalars().all()]

    async def upsert(self, user_id: str, master_resume_id: str, term: str, details: str) -> ConfirmedFactRecord:
        key = normalize(term)
        stmt = select(ResumeConfirmedFactModel).where(
            ResumeConfirmedFactModel.user_id == user_id,
            ResumeConfirmedFactModel.master_resume_id == master_resume_id,
            ResumeConfirmedFactModel.normalized_term == key,
        )
        m = (await self._session.execute(stmt)).scalars().first()
        if m is None:
            m = ResumeConfirmedFactModel(
                user_id=user_id, master_resume_id=master_resume_id, term=term.strip(), normalized_term=key, details=details.strip()
            )
            self._session.add(m)
        else:
            m.details = details.strip()
        await self._session.flush()
        await self._session.refresh(m)
        return self._to_entity(m)
