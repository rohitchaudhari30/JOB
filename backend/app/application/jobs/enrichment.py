"""Automatic job description retrieval and enrichment for tailoring and applications."""
import logging
from typing import Optional

from app.core.config import settings
from app.domain.connections.repositories import BrowserSessionRepository
from app.domain.jobs.entities import Job
from app.domain.jobs.repositories import JobRepository
from app.application.runtime import adapter_registry, browser_manager

logger = logging.getLogger("app.jobs.enrichment")


def detect_job_source_type(job: Job) -> Optional[str]:
    """Resolves platform source identifier from job metadata or apply URL."""
    try:
        supported = adapter_registry.list_supported_sources()
    except Exception:
        supported = ["naukri", "linkedin", "greenhouse", "lever", "ashby", "workday"]

    candidate = (job.source_type or job.source_id or "").lower().strip()
    if candidate in supported:
        return candidate

    url = (job.apply_url or "").lower()
    for source in supported:
        if source in url:
            return source

    return None


async def ensure_job_description(
    job: Job,
    job_repo: JobRepository,
    min_length: Optional[int] = None,
    user_id: Optional[str] = None,
    session_repo: Optional[BrowserSessionRepository] = None,
) -> str:
    """
    Ensures the job has an authoritative, complete description suitable for AI tailoring.
    If the description is only a short search snippet (< min_length), triggers JIT enrichment
    via the source adapter, updates the database, and returns the full description.
    Injects the user's authenticated session cookies if available to bypass anti-bot challenges.
    """
    threshold = min_length if min_length is not None else settings.TAILORING_MIN_JOB_DESCRIPTION_CHARS
    existing_text = (job.raw_description or "").strip()

    if len(existing_text) >= threshold:
        return existing_text

    # Attempt JIT enrichment if apply_url is present
    platform = detect_job_source_type(job)
    if not platform or not job.apply_url:
        logger.info(f"Skipping JIT enrichment for job {job.id}: platform={platform}, has_url={bool(job.apply_url)}")
        return existing_text

    try:
        adapter = adapter_registry.get_source_adapter(platform)
    except Exception as e:
        logger.warning(f"Could not load source adapter for '{platform}': {e}")
        return existing_text

    encrypted_storage_state = None
    if session_repo and user_id:
        try:
            browser_sess = await session_repo.get_by_user_and_platform(str(user_id), platform.lower())
            if (
                browser_sess
                and getattr(browser_sess, "encrypted_storage_state", None)
                and getattr(browser_sess, "status", "ACTIVE") == "ACTIVE"
            ):
                encrypted_storage_state = browser_sess.encrypted_storage_state
                logger.info(
                    f"Loaded active {platform.upper()} session for user [{user_id}]. Injecting authenticated credentials into JIT enrichment."
                )
        except Exception as sess_err:
            logger.warning(f"Could not query session for [{platform}]: {sess_err}")

    logger.info(f"Triggering JIT job description enrichment for job {job.id} ({platform}) from {job.apply_url}")
    context = None
    try:
        context = await browser_manager.create_isolated_context(
            encrypted_storage_state=encrypted_storage_state,
            headless=settings.BROWSER_HEADLESS,
        )
        detailed_job = await adapter.fetch_job_details(context, job.external_job_id, job.apply_url)
        if detailed_job and detailed_job.raw_description:
            fetched_text = detailed_job.raw_description.strip()
            if len(fetched_text) >= threshold:
                job.raw_description = fetched_text
                if detailed_job.parsed_requirements:
                    job.parsed_requirements = detailed_job.parsed_requirements
                await job_repo.save(job)
                logger.info(f"Successfully enriched job {job.id} with {len(fetched_text)} characters from {platform}")
                return fetched_text
            else:
                logger.warning(
                    f"Fetched description for job {job.id} was below threshold ({len(fetched_text)} < {threshold})"
                )
    except Exception as exc:
        logger.warning(f"JIT job description enrichment failed for job {job.id}: {exc}")
    finally:
        if context is not None:
            try:
                await context.close()
            except Exception:
                pass

    return (job.raw_description or "").strip()
