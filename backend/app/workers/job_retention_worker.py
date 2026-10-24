from datetime import datetime, timedelta, timezone
import logging
from typing import Any, Dict, List, Set
from sqlalchemy import func, select, delete as sql_delete, update as sql_update

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.domain.jobs.lifecycle import JobLifecycleState, JobLifecycleStateMachine, LifecycleTrigger
from app.infrastructure.database.models.models import (
    ApplicationModel,
    JobModel,
    MatchResultModel,
    TailoredResumeModel,
    UserJobStateModel,
)

logger = logging.getLogger("app.workers.retention")


async def run_job_retention_sweep(
    batch_size: int | None = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Centralized, idempotent job lifecycle and data retention sweeper.

    Executes in bounded chunks with safe transaction isolation:
    1. Active unverified jobs past RETENTION_STALE_DAYS -> STALE.
    2. Stale jobs past RETENTION_EXPIRED_DAYS -> EXPIRED.
    3. Inactive jobs past RETENTION_UNAPPLIED_PURGE_DAYS:
       - If associated with an Application or saved by a User -> ARCHIVED (never purged).
       - If unapplied and unsaved -> permanently purged.
    4. Dismissed interaction states past RETENTION_DISMISSED_PURGE_DAYS -> cleaned.
    """
    if not settings.RETENTION_ENABLED and not dry_run:
        logger.info("Retention sweeper skipped: RETENTION_ENABLED is false.")
        return {"status": "disabled"}

    limit = batch_size or settings.RETENTION_SWEEPER_BATCH_SIZE
    now = datetime.now(timezone.utc)
    summary = {
        "marked_stale": 0,
        "marked_expired": 0,
        "archived": 0,
        "purged": 0,
        "dismissals_cleaned": 0,
        "dry_run": dry_run,
    }

    # -------------------------------------------------------------------------
    # STAGE 1: Transition unverified active jobs to STALE
    # -------------------------------------------------------------------------
    stale_cutoff = now - timedelta(days=settings.RETENTION_STALE_DAYS)
    async with AsyncSessionLocal() as session:
        stale_stmt = (
            select(JobModel.id)
            .where(
                JobModel.lifecycle_state == JobLifecycleState.ACTIVE.value,
                JobModel.last_seen_at < stale_cutoff,
            )
            .limit(limit)
        )
        res = await session.execute(stale_stmt)
        stale_ids = [r[0] for r in res.fetchall()]

        if stale_ids:
            summary["marked_stale"] = len(stale_ids)
            if not dry_run:
                await session.execute(
                    sql_update(JobModel)
                    .where(JobModel.id.in_(stale_ids))
                    .values(
                        lifecycle_state=JobLifecycleState.STALE.value,
                        is_active=False,
                        updated_at=now,
                    )
                )
                await session.commit()
                logger.info("Retention sweeper: marked %d jobs as STALE", len(stale_ids))

    # -------------------------------------------------------------------------
    # STAGE 2: Transition stale jobs past expiry threshold to EXPIRED
    # -------------------------------------------------------------------------
    expired_cutoff = now - timedelta(days=settings.RETENTION_EXPIRED_DAYS)
    async with AsyncSessionLocal() as session:
        expired_stmt = (
            select(JobModel.id)
            .where(
                JobModel.lifecycle_state == JobLifecycleState.STALE.value,
                JobModel.last_seen_at < expired_cutoff,
            )
            .limit(limit)
        )
        res = await session.execute(expired_stmt)
        expired_ids = [r[0] for r in res.fetchall()]

        if expired_ids:
            summary["marked_expired"] = len(expired_ids)
            if not dry_run:
                await session.execute(
                    sql_update(JobModel)
                    .where(JobModel.id.in_(expired_ids))
                    .values(
                        lifecycle_state=JobLifecycleState.EXPIRED.value,
                        is_active=False,
                        updated_at=now,
                    )
                )
                await session.commit()
                logger.info("Retention sweeper: marked %d jobs as EXPIRED", len(expired_ids))

    # -------------------------------------------------------------------------
    # STAGE 3: Inactive jobs past purge threshold -> ARCHIVE vs PURGE
    # -------------------------------------------------------------------------
    purge_cutoff = now - timedelta(days=settings.RETENTION_UNAPPLIED_PURGE_DAYS)
    async with AsyncSessionLocal() as session:
        candidate_stmt = (
            select(JobModel.id)
            .where(
                JobModel.lifecycle_state.in_([
                    JobLifecycleState.EXPIRED.value,
                    JobLifecycleState.CLOSED.value,
                    JobLifecycleState.REMOVED.value,
                ]),
                JobModel.updated_at < purge_cutoff,
            )
            .limit(limit)
        )
        res = await session.execute(candidate_stmt)
        candidate_ids = [r[0] for r in res.fetchall()]

        if candidate_ids:
            # Query protective relationships
            app_stmt = select(ApplicationModel.job_id).where(ApplicationModel.job_id.in_(candidate_ids))
            app_res = await session.execute(app_stmt)
            applied_ids: Set[str] = set(app_res.scalars().all())

            saved_stmt = select(UserJobStateModel.job_id).where(
                UserJobStateModel.job_id.in_(candidate_ids),
                UserJobStateModel.is_saved == True,
            )
            saved_res = await session.execute(saved_stmt)
            saved_ids: Set[str] = set(saved_res.scalars().all())

            to_archive = [jid for jid in candidate_ids if jid in applied_ids or jid in saved_ids]
            to_purge = [jid for jid in candidate_ids if jid not in applied_ids and jid not in saved_ids]

            summary["archived"] = len(to_archive)
            summary["purged"] = len(to_purge)

            if not dry_run:
                if to_archive:
                    await session.execute(
                        sql_update(JobModel)
                        .where(JobModel.id.in_(to_archive))
                        .values(
                            lifecycle_state=JobLifecycleState.ARCHIVED.value,
                            is_active=False,
                            archived_at=now,
                            updated_at=now,
                        )
                    )
                    logger.info("Retention sweeper: archived %d inactive jobs with active user ties", len(to_archive))

                if to_purge:
                    # Clean up associated child records (tailored resumes & match results)
                    await session.execute(
                        sql_delete(TailoredResumeModel).where(TailoredResumeModel.job_id.in_(to_purge))
                    )
                    await session.execute(
                        sql_delete(MatchResultModel).where(MatchResultModel.job_id.in_(to_purge))
                    )
                    await session.execute(
                        sql_delete(JobModel).where(JobModel.id.in_(to_purge))
                    )
                    logger.info("Retention sweeper: safely purged %d unapplied/unsaved inactive jobs", len(to_purge))

                await session.commit()

    # -------------------------------------------------------------------------
    # STAGE 4: Clean stale dismissed interaction states
    # -------------------------------------------------------------------------
    dismissed_cutoff = now - timedelta(days=settings.RETENTION_DISMISSED_PURGE_DAYS)
    async with AsyncSessionLocal() as session:
        dismiss_stmt = (
            select(UserJobStateModel.id)
            .where(
                UserJobStateModel.is_dismissed == True,
                UserJobStateModel.is_saved == False,
                UserJobStateModel.dismissed_at < dismissed_cutoff,
            )
            .limit(limit)
        )
        res = await session.execute(dismiss_stmt)
        dismiss_ids = [r[0] for r in res.fetchall()]

        if dismiss_ids:
            summary["dismissals_cleaned"] = len(dismiss_ids)
            if not dry_run:
                await session.execute(
                    sql_delete(UserJobStateModel).where(UserJobStateModel.id.in_(dismiss_ids))
                )
                await session.commit()
                logger.info("Retention sweeper: cleaned %d expired dismissed states", len(dismiss_ids))

    logger.info("Retention sweep complete: %s", summary)
    return summary
