"""Database work for automation runs, kept out of the application layer (ARC-01).

The orchestrator decides *what* to record; this class knows *how* (sessions, ORM rows,
SQLite sequence numbers). It opens its own sessions, so a run can keep writing while a
web request has already finished.
"""
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, Optional

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import ConflictException

from app.core import database
from app.infrastructure.ai.gateway import MultiTierAIGateway
from app.infrastructure.database.models.models import AutomationEventModel, AutomationRunModel
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
from app.infrastructure.database.repositories.campaign_repository import (
    SqlAlchemyCampaignExecutionRepository,
    SqlAlchemyQuotaReservationRepository,
)
from app.infrastructure.database.repositories.connection_repository import SqlAlchemyBrowserSessionRepository
from app.infrastructure.database.repositories.job_repository import (
    SqlAlchemyJobRepository,
    SqlAlchemyJobSourceRepository,
)
from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchResultRepository
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemyResumeRepository,
)
from app.infrastructure.database.repositories.user_repository import SqlAlchemyUserRepository

logger = logging.getLogger("app.infrastructure.run_persistence")

FINISHED_STATUSES = ("COMPLETED", "ABORTED", "FAILED")
LIVE_STATUSES = ("STARTING", "RUNNING", "PAUSED")
# Also ended on start-up: a run caught in the middle of stopping when the process died.
INTERRUPTED_STATUSES = LIVE_STATUSES + ("STOPPING",)


@dataclass
class PipelineRepositories:
    job_repo: Any
    source_repo: Any
    profile_repo: Any
    resume_repo: Any
    match_repo: Any
    app_repo: Any
    user_repo: Any
    session_repo: Any
    ai_gateway: Any
    quota_repo: Any


class SqlRunPersistence:
    async def persist_run_start(
        self,
        run_id: str,
        user_id: str,
        status: str,
        source_type: str,
        target_count: int,
        worker_id: str,
        started_at: datetime,
    ) -> None:
        """Creates the run row (events point at it). Does nothing if it already exists."""
        async with database.AsyncSessionLocal() as db:
            if await db.get(AutomationRunModel, run_id):
                return
            db.add(
                AutomationRunModel(
                    id=run_id,
                    user_id=user_id,
                    status=status,
                    source_type=source_type,
                    target_count=target_count,
                    worker_id=worker_id,
                    started_at=started_at,
                    last_event_seq=0,
                )
            )
            try:
                await db.commit()
            except IntegrityError:
                # The database allows one live run per user (uq_automation_run_one_active_per_user).
                await db.rollback()
                raise ConflictException("An active automation run is already in progress.") from None

    async def get_live_run_id(self, user_id: str) -> Optional[str]:
        """The id of this user's live run (starting, running or paused), if any."""
        async with database.AsyncSessionLocal() as db:
            result = await db.execute(
                select(AutomationRunModel.id)
                .where(AutomationRunModel.user_id == user_id, AutomationRunModel.status.in_(LIVE_STATUSES))
                .limit(1)
            )
            return result.scalar_one_or_none()

    async def recover_interrupted_runs(self) -> int:
        """Ends runs a dead process left live, so they cannot block the user's next run.

        Runs only live in this process's memory, so at start-up none can really be running.
        """
        async with database.AsyncSessionLocal() as db:
            result = await db.execute(
                update(AutomationRunModel)
                .where(AutomationRunModel.status.in_(INTERRUPTED_STATUSES))
                .values(
                    status="FAILED",
                    error_message="Interrupted: the server restarted while this run was active.",
                    finished_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
            count = result.rowcount or 0
        if count:
            logger.warning("Ended %s automation run(s) left active by a previous server process.", count)
        return count

    @asynccontextmanager
    async def open_pipeline_repositories(self) -> AsyncIterator[PipelineRepositories]:
        """One session and one set of repositories for a whole run. Commits when the run body ends cleanly."""
        async with database.AsyncSessionLocal() as db:
            yield PipelineRepositories(
                job_repo=SqlAlchemyJobRepository(db),
                source_repo=SqlAlchemyJobSourceRepository(db),
                profile_repo=SqlAlchemyProfileRepository(db),
                resume_repo=SqlAlchemyResumeRepository(db),
                match_repo=SqlAlchemyMatchResultRepository(db),
                app_repo=SqlAlchemyApplicationRepository(db, commit_each_write=True),
                user_repo=SqlAlchemyUserRepository(db),
                session_repo=SqlAlchemyBrowserSessionRepository(db),
                ai_gateway=MultiTierAIGateway(session=db),
                quota_repo=SqlAlchemyQuotaReservationRepository(db),
            )
            await db.commit()

    @asynccontextmanager
    async def open_execution_repository(self) -> AsyncIterator[SqlAlchemyCampaignExecutionRepository]:
        """Repositories only flush, so this commits when the block ends cleanly."""
        async with database.AsyncSessionLocal() as db:
            yield SqlAlchemyCampaignExecutionRepository(db)
            await db.commit()

    async def record_heartbeat(
        self,
        run_id: str,
        execution_id: Optional[str],
        worker_id: str,
        lease_seconds: int,
        lease_version: Optional[int],
    ) -> None:
        async with database.AsyncSessionLocal() as db:
            await SqlAlchemyCampaignExecutionRepository(db).record_heartbeat(
                execution_id=execution_id,
                worker_id=worker_id,
                lease_seconds=lease_seconds,
                lease_version=lease_version,
            )
            run = await db.get(AutomationRunModel, run_id)
            if run:
                run.last_heartbeat_at = datetime.now(timezone.utc)
            await db.commit()

    async def append_run_event(self, snapshot: Dict[str, Any], event_name: str, message: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Writes one timeline event and the run counters in a single transaction.

        `snapshot` is a plain dict of the live session (ids, status, counters). Returns
        the new sequence number and event id. Raises on database errors; the caller retries.
        """
        run_id = snapshot["run_id"]
        async with database.AsyncSessionLocal() as db:
            run = await db.get(AutomationRunModel, run_id)
            if not run:
                run = AutomationRunModel(
                    id=run_id,
                    user_id=snapshot["user_id"],
                    status=snapshot["status"],
                    worker_id=snapshot["worker_id"],
                    started_at=snapshot["created_at"],
                    last_event_seq=0,
                )
                db.add(run)
                await db.flush()

            # The highest stored sequence wins, so numbers only ever go up.
            db_max_seq = (
                await db.execute(select(func.max(AutomationEventModel.seq)).where(AutomationEventModel.run_id == run_id))
            ).scalar() or 0
            seq = max(run.last_event_seq or 0, db_max_seq) + 1
            run.last_event_seq = seq
            event_id = f"{run_id}_evt_{seq}"

            run.status = snapshot["status"]
            run.discovered_count = snapshot["discovered"]
            run.matched_count = snapshot["matched"]
            run.applied_count = snapshot["applied"]
            run.failed_count = snapshot["failed"]
            run.current_job_title = snapshot["current_job_title"]
            run.last_heartbeat_at = datetime.now(timezone.utc)
            if snapshot["error_message"]:
                run.error_message = snapshot["error_message"]
            if snapshot["status"] in FINISHED_STATUSES or snapshot.get("is_finished"):
                run.finished_at = snapshot["completed_at"] or datetime.now(timezone.utc)

            db.add(
                AutomationEventModel(
                    id=event_id,
                    run_id=run_id,
                    seq=seq,
                    event_name=event_name,
                    payload={
                        "seq": seq,
                        "message": message,
                        "state": snapshot["active_state"],
                        "stats": {
                            "discovered": snapshot["discovered"],
                            "matched": snapshot["matched"],
                            "applied": snapshot["applied"],
                        },
                        **payload,
                    },
                )
            )
            await db.commit()
            return {"seq": seq, "event_id": event_id}
