import logging
import uuid
from typing import Any, Dict, List, Optional
from app.core.exceptions import EntityNotFoundException
from app.domain.jobs.entities import Job, JobSource, SearchQueryFilter
from app.domain.jobs.repositories import JobRepository, JobSourceRepository
from app.infrastructure.browser.adapters.registry import adapter_registry
from app.infrastructure.browser.browser_manager import browser_manager

logger = logging.getLogger("app.application.jobs")


class DiscoverJobsUseCase:
    """Orchestrates automated job discovery using platform adapters and database deduplication."""

    def __init__(
        self,
        job_repo: JobRepository,
        job_source_repo: JobSourceRepository,
        browser_mgr=None,
    ):
        self._job_repo = job_repo
        self._source_repo = job_source_repo
        self._browser_mgr = browser_mgr or browser_manager

    async def execute(
        self,
        user_id: str,
        source_type: str,
        filters: SearchQueryFilter,
        encrypted_storage_state: Optional[str] = None,
        run_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        # 1. Ensure JobSource exists in catalog
        source = await self._source_repo.get_by_type(source_type)
        if not source:
            source = JobSource(
                id=str(uuid.uuid4()),
                source_type=source_type.lower(),
                base_url=f"https://www.{source_type.lower()}.com",
                is_active=True,
            )
            source = await self._source_repo.save(source)

        # 2. Get registered adapter
        adapter = adapter_registry.get_source_adapter(source_type)

        # 3. Create isolated browser context
        context = await self._browser_mgr.create_isolated_context(
            encrypted_storage_state=encrypted_storage_state
        )

        discovered_total = 0
        new_saved = 0
        duplicates = 0
        saved_jobs: List[Job] = []

        try:
            logger.info(f"Starting job discovery on [{source_type}] for user [{user_id}]...")
            import inspect
            sig = inspect.signature(adapter.search_jobs)
            if "user_id" in sig.parameters or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
                job_stream = adapter.search_jobs(context, filters, user_id=user_id, run_id=run_id)
            else:
                job_stream = adapter.search_jobs(context, filters)

            async for raw_job in job_stream:
                discovered_total += 1
                raw_job.source_id = source.id
                raw_job.source_type = source.source_type

                # Deduplication Check (source_id + external_job_id)
                existing = await self._job_repo.get_by_external_id(source.id, raw_job.external_job_id)
                if existing:
                    duplicates += 1
                    await self._job_repo.touch_seen(existing.id)
                    logger.debug(f"Updated last_seen_at on duplicate job: {raw_job.external_job_id} ({raw_job.title})")
                    continue

                # Save new job to database
                saved = await self._job_repo.save(raw_job)
                saved_jobs.append(saved)
                new_saved += 1
                logger.info(f"Saved new job: {saved.title} at {saved.company} (ID: {saved.id})")

        except Exception as e:
            logger.error(f"Job discovery failed during execution on [{source_type}]: {e}", exc_info=True)
            raise
        finally:
            await context.close()

        return {
            "source": source_type,
            "discovered_total": discovered_total,
            "new_jobs_count": new_saved,
            "skipped_duplicates": duplicates,
            "jobs": [
                {
                    "id": j.id,
                    "title": j.title,
                    "company": j.company,
                    "location": j.location,
                    "min_experience": j.min_experience_years,
                    "max_experience": j.max_experience_years,
                    "min_salary": j.min_salary,
                    "max_salary": j.max_salary,
                    "apply_url": j.apply_url,
                    "posted_at": j.posted_at.isoformat() if j.posted_at else None,
                    "raw_posted_text": j.raw_posted_text,
                    "freshness_bucket": j.freshness_bucket,
                    "freshness_score": j.freshness_score,
                }
                for j in saved_jobs
            ],
        }


class ListJobsUseCase:
    def __init__(self, job_repo: JobRepository):
        self._job_repo = job_repo

    async def execute(
        self,
        skip: int = 0,
        limit: int = 50,
        search: Optional[str] = None,
        location: Optional[str] = None,
        source_id: Optional[str] = None,
        posted_within: Optional[str] = None,
        freshness_bucket: Optional[str] = None,
        sort_by: Optional[str] = "newest",
    ) -> Dict[str, Any]:
        jobs = await self._job_repo.list_jobs(
            skip=skip,
            limit=limit,
            search=search,
            location=location,
            source_id=source_id,
            posted_within=posted_within,
            freshness_bucket=freshness_bucket,
            sort_by=sort_by,
        )
        total_count = await self._job_repo.count_jobs(
            search=search,
            location=location,
            source_id=source_id,
            posted_within=posted_within,
            freshness_bucket=freshness_bucket,
        )
        return {
            "total": total_count,
            "skip": skip,
            "limit": limit,
            "items": jobs,
        }


class GetJobDetailsUseCase:
    def __init__(self, job_repo: JobRepository):
        self._job_repo = job_repo

    async def execute(self, job_id: str) -> Job:
        job = await self._job_repo.get_by_id(job_id)
        if not job:
            raise EntityNotFoundException("Job", job_id)
        return job


class DeleteJobUseCase:
    def __init__(self, job_repo: JobRepository):
        self._job_repo = job_repo

    async def execute(self, job_id: str) -> bool:
        success = await self._job_repo.delete(job_id)
        if not success:
            raise EntityNotFoundException("Job", job_id)
        return True


class ClearJobsUseCase:
    def __init__(self, job_repo: JobRepository):
        self._job_repo = job_repo

    async def execute(self, source_type: Optional[str] = None) -> int:
        return await self._job_repo.clear_all(source_type=source_type)
