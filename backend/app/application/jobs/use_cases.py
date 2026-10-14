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
        matching_task_repo=None,
        browser_mgr=None,
    ):
        self._job_repo = job_repo
        self._source_repo = job_source_repo
        self._matching_task_repo = matching_task_repo
        self._browser_mgr = browser_mgr or browser_manager

    async def execute(
        self,
        user_id: str,
        source_type: str,
        filters: SearchQueryFilter,
        encrypted_storage_state: Optional[str] = None,
        run_id: Optional[str] = None,
        headless: bool = True,
        auto_evaluate: bool = False,
    ) -> Dict[str, Any]:
        from app.domain.jobs.identity import CanonicalJobIdentifier
        import hashlib

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
            encrypted_storage_state=encrypted_storage_state,
            headless=headless,
        )

        discovered_total = 0
        new_saved = 0
        duplicates = 0
        enqueued_count = 0
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
                if run_id:
                    from app.application.automation.orchestrator import orchestrator
                    sess = orchestrator.get_session(run_id)
                    if sess and sess.cancel_requested:
                        logger.info(f"Stopping job discovery early for run [{run_id}] because stop was requested.")
                        break

                discovered_total += 1
                raw_job.source_id = source.id
                raw_job.source_type = source.source_type

                # Compute canonical cross-portal fingerprint
                canonical_key, confidence = CanonicalJobIdentifier.compute_canonical_key(
                    company=raw_job.company or "",
                    title=raw_job.title or "",
                    location=raw_job.location or "",
                    description=raw_job.raw_description or "",
                    external_job_id=raw_job.external_job_id or "",
                )
                raw_job.canonical_job_key = canonical_key
                raw_job.canonical_confidence = confidence.value

                # Deduplication Check:
                # 1. Exact platform match (source_id + external_job_id)
                existing = await self._job_repo.get_by_external_id(source.id, raw_job.external_job_id)
                # 2. Cross-portal canonical match
                if not existing and canonical_key:
                    existing = await self._job_repo.get_by_canonical_key(canonical_key)

                if existing:
                    duplicates += 1
                    await self._job_repo.touch_seen(existing.id)
                    logger.debug(f"Updated last_seen_at on duplicate job: {raw_job.external_job_id} / key {canonical_key} ({raw_job.title})")
                    saved_jobs.append(existing)
                    if auto_evaluate and self._matching_task_repo:
                        task_idem_key = hashlib.sha256(f"{user_id}:{existing.id}".encode()).hexdigest()
                        await self._matching_task_repo.enqueue_task(
                            user_id=user_id,
                            job_id=existing.id,
                            task_idempotency_key=task_idem_key,
                        )
                        enqueued_count += 1
                    continue

                # Save new job to database
                saved = await self._job_repo.save(raw_job)
                saved_jobs.append(saved)
                new_saved += 1
                logger.info(f"Saved new job: {saved.title} at {saved.company} (ID: {saved.id})")

                # Asynchronous evaluation enqueuing
                if auto_evaluate and self._matching_task_repo:
                    task_idem_key = hashlib.sha256(f"{user_id}:{saved.id}".encode()).hexdigest()
                    await self._matching_task_repo.enqueue_task(
                        user_id=user_id,
                        job_id=saved.id,
                        task_idempotency_key=task_idem_key,
                    )
                    enqueued_count += 1

            if enqueued_count > 0:
                try:
                    from app.workers.matching_worker import matching_worker
                    matching_worker.notify_new_task()
                except Exception:
                    pass

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
            "enqueued_count": enqueued_count,
            "evaluation_status": "ENQUEUED" if enqueued_count > 0 else "SKIPPED",
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
                    "canonical_job_key": getattr(j, "canonical_job_key", None),
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
