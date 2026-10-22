from typing import List
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.jobs.entities import Job, JobSource
from app.domain.jobs.repositories import JobRepository, JobSourceRepository
from app.infrastructure.database.models.models import JobModel, JobSourceModel


class SqlAlchemyJobRepository(JobRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: JobModel) -> Job:
        source_type_name = "naukri"
        loaded_source = model.__dict__.get("source")
        if loaded_source and getattr(loaded_source, "source_type", None):
            source_type_name = loaded_source.source_type
        elif model.posted_at_source:
            source_type_name = model.posted_at_source

        return Job(
            id=model.id,
            source_id=model.source_id,
            source_type=source_type_name,
            external_job_id=model.external_job_id,
            title=model.title,
            company=model.company,
            location=model.location,
            min_experience_years=model.min_experience_years,
            max_experience_years=model.max_experience_years,
            min_salary=model.min_salary,
            max_salary=model.max_salary,
            salary_currency=model.salary_currency,
            employment_type=model.employment_type,
            apply_url=model.apply_url,
            raw_description=model.raw_description,
            parsed_requirements=model.parsed_requirements or {},
            embedding=model.embedding,
            is_active=model.is_active,
            posted_at=model.posted_at,
            first_seen_at=model.first_seen_at,
            last_seen_at=model.last_seen_at,
            raw_posted_text=model.raw_posted_text,
            posted_at_precision=model.posted_at_precision or "UNKNOWN",
            posted_at_source=model.posted_at_source,
            freshness_bucket=model.freshness_bucket or "UNKNOWN",
            freshness_score=model.freshness_score or 0.0,
            canonical_job_key=model.canonical_job_key,
            canonical_confidence=model.canonical_confidence or "PLATFORM_EXACT",
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def get_by_id(self, job_id: str) -> Job | None:
        stmt = select(JobModel).options(selectinload(JobModel.source)).where(JobModel.id == job_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def get_by_external_id(self, source_id: str, external_job_id: str) -> Job | None:
        stmt = select(JobModel).options(selectinload(JobModel.source)).where(
            JobModel.source_id == source_id,
            JobModel.external_job_id == external_job_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def get_by_canonical_key(self, canonical_job_key: str) -> Job | None:
        if not canonical_job_key:
            return None
        stmt = select(JobModel).options(selectinload(JobModel.source)).where(
            JobModel.canonical_job_key == canonical_job_key,
            JobModel.is_active == True,
        ).order_by(JobModel.created_at.asc())
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def touch_seen(self, job_id: str) -> None:
        from datetime import datetime, timezone
        stmt = select(JobModel).where(JobModel.id == job_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model:
            model.last_seen_at = datetime.now(timezone.utc)

    async def save(self, job: Job) -> Job:
        from datetime import datetime, timezone
        from app.domain.jobs.freshness import FreshnessCalculator
        stmt = select(JobModel).options(selectinload(JobModel.source)).where(JobModel.id == job.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        # Recalculate freshness bucket and score before saving
        f_bucket = FreshnessCalculator.calculate_bucket(job.posted_at).value if job.posted_at else job.freshness_bucket
        f_score = FreshnessCalculator.calculate_score(job.posted_at) if job.posted_at else job.freshness_score

        now = datetime.now(timezone.utc)
        if not model:
            model = JobModel(
                id=job.id,
                source_id=job.source_id,
                external_job_id=job.external_job_id,
                title=job.title,
                company=job.company,
                location=job.location,
                min_experience_years=job.min_experience_years,
                max_experience_years=job.max_experience_years,
                min_salary=job.min_salary,
                max_salary=job.max_salary,
                salary_currency=job.salary_currency,
                employment_type=job.employment_type,
                apply_url=job.apply_url,
                raw_description=job.raw_description,
                parsed_requirements=job.parsed_requirements,
                embedding=job.embedding,
                is_active=job.is_active,
                posted_at=job.posted_at,
                first_seen_at=job.first_seen_at or now,
                last_seen_at=job.last_seen_at or now,
                raw_posted_text=job.raw_posted_text,
                posted_at_precision=job.posted_at_precision,
                posted_at_source=job.posted_at_source,
                freshness_bucket=f_bucket,
                freshness_score=f_score,
                canonical_job_key=job.canonical_job_key,
                canonical_confidence=job.canonical_confidence or "PLATFORM_EXACT",
            )
            self._session.add(model)
        else:
            model.title = job.title
            model.company = job.company
            model.location = job.location
            model.min_experience_years = job.min_experience_years
            model.max_experience_years = job.max_experience_years
            model.min_salary = job.min_salary
            model.max_salary = job.max_salary
            model.apply_url = job.apply_url
            model.raw_description = job.raw_description
            model.parsed_requirements = job.parsed_requirements
            model.embedding = job.embedding
            model.is_active = job.is_active
            if job.posted_at:
                model.posted_at = job.posted_at
            if job.raw_posted_text:
                model.raw_posted_text = job.raw_posted_text
            if job.canonical_job_key:
                model.canonical_job_key = job.canonical_job_key
            if job.canonical_confidence:
                model.canonical_confidence = job.canonical_confidence
            model.last_seen_at = now
            model.freshness_bucket = f_bucket
            model.freshness_score = f_score

        from sqlalchemy.exc import IntegrityError
        try:
            async with self._session.begin_nested():
                await self._session.flush()
            await self._session.refresh(model)
            return self._to_entity(model)
        except IntegrityError as e:
            await self._session.rollback()
            existing_ext = await self.get_by_external_id(job.source_id, job.external_job_id)
            if existing_ext:
                await self.touch_seen(existing_ext.id)
                return existing_ext
            if job.canonical_job_key:
                existing_canon = await self.get_by_canonical_key(job.canonical_job_key)
                if existing_canon:
                    await self.touch_seen(existing_canon.id)
                    return existing_canon
            raise

    def _apply_filters(
        self,
        stmt,
        search: str | None = None,
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
    ):
        from datetime import datetime, timedelta, timezone
        stmt = stmt.where(JobModel.is_active == True)

        if search:
            stmt = stmt.where(
                (JobModel.title.ilike(f"%{search}%")) | (JobModel.company.ilike(f"%{search}%"))
            )
        if location:
            stmt = stmt.where(JobModel.location.ilike(f"%{location}%"))
        if source_id:
            stmt = stmt.where(JobModel.source_id == source_id)
        if freshness_bucket:
            stmt = stmt.where(JobModel.freshness_bucket == freshness_bucket)

        if posted_within:
            now = datetime.now(timezone.utc)
            pw = posted_within.lower().strip()
            delta_map = {
                "1h": timedelta(hours=1),
                "3h": timedelta(hours=3),
                "6h": timedelta(hours=6),
                "12h": timedelta(hours=12),
                "24h": timedelta(hours=24),
                "1d": timedelta(days=1),
                "today": timedelta(hours=24),
                "3d": timedelta(days=3),
                "7d": timedelta(days=7),
                "14d": timedelta(days=14),
                "30d": timedelta(days=30),
            }
            if pw in delta_map:
                cutoff = now - delta_map[pw]
                bind = getattr(self._session, "bind", None)
                dialect_name = getattr(bind, "dialect", None).name if getattr(bind, "dialect", None) else "sqlite"
                if dialect_name == "sqlite":
                    stmt = stmt.where(
                        func.datetime(func.replace(func.replace(JobModel.posted_at, "T", " "), "+00:00", ""))
                        >= cutoff.strftime("%Y-%m-%d %H:%M:%S")
                    )
                else:
                    stmt = stmt.where(JobModel.posted_at >= cutoff)

        return stmt

    async def list_jobs(
        self,
        skip: int = 0,
        limit: int = 50,
        search: str | None = None,
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
        sort_by: str | None = "newest",
    ) -> List[Job]:
        stmt = select(JobModel).options(selectinload(JobModel.source))
        stmt = self._apply_filters(
            stmt,
            search=search,
            location=location,
            source_id=source_id,
            posted_within=posted_within,
            freshness_bucket=freshness_bucket,
        )

        sb = (sort_by or "newest").lower()
        if sb in ("newest", "posted_at"):
            stmt = stmt.order_by(JobModel.posted_at.desc().nullslast(), JobModel.created_at.desc(), JobModel.id.desc())
        elif sb in ("freshness", "freshness_score"):
            stmt = stmt.order_by(JobModel.freshness_score.desc(), JobModel.posted_at.desc().nullslast(), JobModel.id.desc())
        elif sb in ("salary", "salary_high_to_low"):
            stmt = stmt.order_by(JobModel.max_salary.desc().nullslast(), JobModel.posted_at.desc().nullslast(), JobModel.id.desc())
        elif sb == "salary_low_to_high":
            stmt = stmt.order_by(JobModel.min_salary.asc().nullslast(), JobModel.id.desc())
        else:
            stmt = stmt.order_by(JobModel.created_at.desc(), JobModel.id.desc())

        stmt = stmt.offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def count_jobs(
        self,
        search: str | None = None,
        location: str | None = None,
        source_id: str | None = None,
        posted_within: str | None = None,
        freshness_bucket: str | None = None,
    ) -> int:
        stmt = select(func.count(JobModel.id))
        stmt = self._apply_filters(
            stmt,
            search=search,
            location=location,
            source_id=source_id,
            posted_within=posted_within,
            freshness_bucket=freshness_bucket,
        )
        result = await self._session.execute(stmt)
        return result.scalar() or 0

    async def _purge_tailored_for_jobs(self, job_ids: list) -> None:
        """Hard-deleting a job also removes the tailored resumes made for it, files included."""
        import os
        from sqlalchemy import delete as sql_delete
        from app.infrastructure.database.models.models import TailoredResumeModel

        if not job_ids:
            return
        rows = await self._session.execute(
            select(TailoredResumeModel.file_path, TailoredResumeModel.pdf_file_path).where(
                TailoredResumeModel.job_id.in_(job_ids)
            )
        )
        for docx_path, pdf_path in rows:
            for path in (docx_path, pdf_path):
                if path:
                    try:
                        os.remove(path)
                    except OSError:
                        pass
        await self._session.execute(sql_delete(TailoredResumeModel).where(TailoredResumeModel.job_id.in_(job_ids)))

    async def delete(self, job_id: str) -> bool:
        from app.infrastructure.database.models.models import MatchResultModel, ApplicationModel
        from sqlalchemy import delete as sql_delete

        app_stmt = select(func.count(ApplicationModel.id)).where(ApplicationModel.job_id == job_id)
        app_res = await self._session.execute(app_stmt)
        has_apps = (app_res.scalar() or 0) > 0

        job_stmt = select(JobModel).where(JobModel.id == job_id)
        job_res = await self._session.execute(job_stmt)
        job_model = job_res.scalar_one_or_none()
        if not job_model:
            return False

        if has_apps:
            # Soft-delete to protect application audit logs
            job_model.is_active = False
        else:
            await self._purge_tailored_for_jobs([job_id])
            await self._session.execute(sql_delete(MatchResultModel).where(MatchResultModel.job_id == job_id))
            await self._session.delete(job_model)

        await self._session.flush()
        return True

    async def clear_all(self, source_type: str | None = None) -> int:
        from app.infrastructure.database.models.models import MatchResultModel, ApplicationModel, JobSourceModel
        from sqlalchemy import delete as sql_delete, update as sql_update

        stmt = select(JobModel.id)
        if source_type:
            stmt = stmt.join(JobSourceModel, JobModel.source_id == JobSourceModel.id).where(JobSourceModel.source_type == source_type)

        res = await self._session.execute(stmt)
        job_ids = [r[0] for r in res.fetchall()]
        if not job_ids:
            return 0

        applied_stmt = select(ApplicationModel.job_id).where(ApplicationModel.job_id.in_(job_ids))
        applied_res = await self._session.execute(applied_stmt)
        applied_job_ids = set(applied_res.scalars().all())

        deletable_job_ids = [jid for jid in job_ids if jid not in applied_job_ids]
        soft_delete_job_ids = [jid for jid in job_ids if jid in applied_job_ids]

        if deletable_job_ids:
            await self._purge_tailored_for_jobs(deletable_job_ids)
            await self._session.execute(sql_delete(MatchResultModel).where(MatchResultModel.job_id.in_(deletable_job_ids)))
            await self._session.execute(sql_delete(JobModel).where(JobModel.id.in_(deletable_job_ids)))

        if soft_delete_job_ids:
            await self._session.execute(sql_update(JobModel).where(JobModel.id.in_(soft_delete_job_ids)).values(is_active=False))

        await self._session.flush()
        return len(job_ids)


class SqlAlchemyJobSourceRepository(JobSourceRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: JobSourceModel) -> JobSource:
        return JobSource(
            id=model.id,
            source_type=model.source_type,
            base_url=model.base_url,
            is_active=model.is_active,
            rate_limit_per_min=model.rate_limit_per_min,
        )

    async def get_by_type(self, source_type: str) -> JobSource | None:
        stmt = select(JobSourceModel).where(JobSourceModel.source_type == source_type)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def list_active_sources(self) -> List[JobSource]:
        stmt = select(JobSourceModel).where(JobSourceModel.is_active == True)
        result = await self._session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def save(self, source: JobSource) -> JobSource:
        stmt = select(JobSourceModel).where(JobSourceModel.id == source.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            model = JobSourceModel(
                id=source.id,
                source_type=source.source_type,
                base_url=source.base_url,
                is_active=source.is_active,
                rate_limit_per_min=source.rate_limit_per_min,
            )
            self._session.add(model)
        else:
            model.base_url = source.base_url
            model.is_active = source.is_active
            model.rate_limit_per_min = source.rate_limit_per_min

        await self._session.flush()
        await self._session.refresh(model)
        return self._to_entity(model)
