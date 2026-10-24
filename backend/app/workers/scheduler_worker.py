import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, Callable, Dict, List, Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from pydantic import BaseModel, Field

logger = logging.getLogger("app.workers.scheduler")


class ScheduleJobConfig(BaseModel):
    schedule_id: str
    user_id: str
    source_type: str = "naukri"
    roles: List[str] = Field(default_factory=list)
    locations: List[str] = Field(default_factory=list)
    cron_expression: Optional[str] = None  # e.g., "0 9 * * 1-5" (Mon-Fri at 9 AM)
    interval_minutes: Optional[int] = None  # e.g., 180 (Every 3 hours)
    auto_apply: bool = False  # unattended submitting is opt-in; off = discover and match, then wait for approval
    max_applications_per_run: int = 10
    is_active: bool = True
    created_at: Optional[datetime] = None


class AutomationSchedulerWorker:
    """
    Background job scheduler worker using APScheduler.
    Executes automated job search, matching, and application pipelines on cron/interval schedules.
    """

    def __init__(self):
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._configs: Dict[str, ScheduleJobConfig] = {}
        self._lock = asyncio.Lock()

    def initialize(self):
        if not self._scheduler:
            try:
                loop = asyncio.get_running_loop()
                self._scheduler = AsyncIOScheduler(event_loop=loop)
                self._scheduler.start()
                self._register_maintenance_jobs()
                logger.info("APScheduler worker initialized and started.")
            except RuntimeError:
                # No running loop at call time; scheduler will be initialized when loop is active
                logger.warning("APScheduler initialized without active event loop. Will start when loop is ready.")

    def _register_maintenance_jobs(self):
        if self._scheduler and not self._scheduler.get_job("lease_reclamation_sweeper"):
            async def _sweep():
                try:
                    from app.core.database import AsyncSessionLocal
                    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignExecutionRepository
                    async with AsyncSessionLocal() as db_session:
                        exec_repo = SqlAlchemyCampaignExecutionRepository(db_session)
                        reclaimed = await exec_repo.reclaim_expired_leases()
                        if reclaimed > 0:
                            logger.info(f"Lease sweeper automatically reclaimed {reclaimed} abandoned execution leases.")
                except Exception as e:
                    logger.warning(f"Error during scheduled execution lease reclamation: {e}")

            try:
                self._scheduler.add_job(
                    func=_sweep,
                    trigger=IntervalTrigger(seconds=60),
                    id="lease_reclamation_sweeper",
                    replace_existing=True,
                )
            except Exception as e:
                logger.warning(f"Could not register lease_reclamation_sweeper: {e}")

        if self._scheduler and not self._scheduler.get_job("campaign_schedule_ticker"):
            async def _tick():
                try:
                    from app.workers.campaign_scheduler import run_due_campaign_schedules
                    await run_due_campaign_schedules()
                except Exception as e:
                    logger.warning(f"Error during campaign schedule tick: {e}")

            try:
                self._scheduler.add_job(
                    func=_tick,
                    trigger=IntervalTrigger(seconds=60),
                    id="campaign_schedule_ticker",
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                )
            except Exception as e:
                logger.warning(f"Could not register campaign_schedule_ticker: {e}")

        if self._scheduler and not self._scheduler.get_job("stale_submitting_sweeper"):
            async def _sweep_stale_submitting():
                try:
                    from app.core.database import AsyncSessionLocal
                    from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
                    async with AsyncSessionLocal() as db_session:
                        app_repo = SqlAlchemyApplicationRepository(db_session)
                        recovered = await app_repo.recover_stale_submitting_applications(older_than_seconds=300)
                        if recovered > 0:
                            await db_session.commit()
                            logger.info(f"Crash recovery sweeper transitioned {recovered} stale SUBMITTING applications to RECONCILIATION_REQUIRED.")
                except Exception as e:
                    logger.warning(f"Error during scheduled stale SUBMITTING application recovery: {e}")

            try:
                self._scheduler.add_job(
                    func=_sweep_stale_submitting,
                    trigger=IntervalTrigger(seconds=120),
                    id="stale_submitting_sweeper",
                    replace_existing=True,
                )
            except Exception as e:
                logger.warning(f"Could not register stale_submitting_sweeper: {e}")

        if self._scheduler and not self._scheduler.get_job("job_lifecycle_retention_sweeper"):
            async def _sweep_retention():
                try:
                    from app.workers.job_retention_worker import run_job_retention_sweep
                    await run_job_retention_sweep()
                except Exception as e:
                    logger.warning(f"Error during job lifecycle retention sweep: {e}")

            try:
                from app.core.config import settings
                self._scheduler.add_job(
                    func=_sweep_retention,
                    trigger=IntervalTrigger(hours=settings.RETENTION_SWEEPER_INTERVAL_HOURS),
                    id="job_lifecycle_retention_sweeper",
                    replace_existing=True,
                    max_instances=1,
                    coalesce=True,
                )
            except Exception as e:
                logger.warning(f"Could not register job_lifecycle_retention_sweeper: {e}")

    def shutdown(self):
        if self._scheduler and self._scheduler.running:
            try:
                self._scheduler.shutdown(wait=False)
            except RuntimeError:
                # The event loop it was started on is already closed, so there is nothing left to stop.
                pass
            self._scheduler = None
            logger.info("APScheduler worker shut down.")

    def add_schedule(
        self,
        config: ScheduleJobConfig,
        task_callable: Callable[..., Any],
        **kwargs,
    ) -> bool:
        self.initialize()
        if not self._scheduler:
            return False

        trigger = None
        if config.cron_expression:
            parts = config.cron_expression.strip().split()
            if len(parts) == 5:
                minute, hour, day, month, day_of_week = parts
                trigger = CronTrigger(
                    minute=minute,
                    hour=hour,
                    day=day,
                    month=month,
                    day_of_week=day_of_week,
                )
        elif config.interval_minutes:
            trigger = IntervalTrigger(minutes=config.interval_minutes)

        if not trigger:
            logger.error(f"Invalid trigger configuration for schedule [{config.schedule_id}].")
            return False

        try:
            self._scheduler.add_job(
                func=task_callable,
                trigger=trigger,
                id=config.schedule_id,
                replace_existing=True,
                kwargs=kwargs,
                max_instances=1,  # a slow run must not overlap itself
                coalesce=True,  # missed firings collapse into one
                misfire_grace_time=300,
            )
            self._configs[config.schedule_id] = config
            logger.info(f"Registered scheduled automation job [{config.schedule_id}] for user [{config.user_id}].")
            return True
        except Exception as e:
            logger.error(f"Failed to register schedule [{config.schedule_id}]: {e}")
            return False

    def remove_schedule(self, schedule_id: str) -> bool:
        if self._scheduler and self._scheduler.get_job(schedule_id):
            self._scheduler.remove_job(schedule_id)
            if schedule_id in self._configs:
                del self._configs[schedule_id]
            logger.info(f"Removed scheduled job [{schedule_id}].")
            return True
        return False

    def list_schedules_for_user(self, user_id: str) -> List[ScheduleJobConfig]:
        return [c for c in self._configs.values() if c.user_id == user_id]

    def get_schedule(self, schedule_id: str) -> Optional[ScheduleJobConfig]:
        return self._configs.get(schedule_id)


async def scheduled_run_callback(schedule_id: str, user_id: str) -> None:
    """What a schedule does when it fires: start one run for that user, through the same path as the Start button.

    Safe by construction:
    * `SCHEDULED_RUNS_ENABLED` is an operator kill switch.
    * Only one live run per user: if one is already active (or paused), this firing is skipped.
    * `auto_apply` is off unless the user chose it. Off means discover and match only; matches wait for approval.
    * With it on, the pipeline still applies the REQUIRE_APPROVAL rule and the daily account/platform caps.
    * It never raises into the scheduler; every outcome is logged.
    """
    from app.core.config import settings

    if not settings.SCHEDULED_RUNS_ENABLED:
        logger.info("Schedule [%s] fired but scheduled runs are disabled (SCHEDULED_RUNS_ENABLED=false).", schedule_id)
        return
    config = scheduler_worker.get_schedule(schedule_id)
    if config is None or not config.is_active or config.user_id != user_id:
        logger.warning("Schedule [%s] fired but is unknown, inactive or not owned by [%s]; nothing started.", schedule_id, user_id)
        return
    try:
        from app.application.automation.orchestrator import orchestrator
        from app.core.exceptions import ConflictException

        live = await orchestrator.get_live_run_id(user_id)
        if live:
            logger.info("Schedule [%s] skipped: run [%s] is already active for user [%s].", schedule_id, live, user_id)
            return
        session = await orchestrator.start_run(
            user_id=user_id,
            source_type=config.source_type,
            roles=config.roles,
            locations=config.locations or None,
            auto_apply_matches=config.auto_apply,
            max_applications=max(1, min(config.max_applications_per_run, settings.GLOBAL_ACCOUNT_SAFE_CEILING)),
        )
        logger.info(
            "Schedule [%s] started run [%s] for user [%s] (auto_apply=%s).", schedule_id, session.run_id, user_id, config.auto_apply
        )
    except ConflictException:
        logger.info("Schedule [%s] skipped: another run started first for user [%s].", schedule_id, user_id)
    except Exception as e:  # never break the scheduler loop
        logger.error("Schedule [%s] could not start a run for user [%s]: %s", schedule_id, user_id, e)


async def save_schedule(config: ScheduleJobConfig) -> None:
    from app.core.database import AsyncSessionLocal
    from app.infrastructure.database.models.models import AutomationScheduleModel

    async with AsyncSessionLocal() as session:
        session.add(
            AutomationScheduleModel(id=config.schedule_id, user_id=config.user_id, config_json=config.model_dump_json())
        )
        await session.commit()


async def delete_saved_schedule(schedule_id: str) -> None:
    from sqlalchemy import delete

    from app.core.database import AsyncSessionLocal
    from app.infrastructure.database.models.models import AutomationScheduleModel

    async with AsyncSessionLocal() as session:
        await session.execute(delete(AutomationScheduleModel).where(AutomationScheduleModel.id == schedule_id))
        await session.commit()


async def restore_saved_schedules() -> int:
    """Re-registers every saved, active schedule after a restart. Returns how many were restored."""
    from sqlalchemy import select

    from app.core.database import AsyncSessionLocal
    from app.infrastructure.database.models.models import AutomationScheduleModel

    async with AsyncSessionLocal() as session:
        rows = (await session.scalars(select(AutomationScheduleModel))).all()

    restored = 0
    for row in rows:
        try:
            config = ScheduleJobConfig.model_validate_json(row.config_json)
        except ValueError:
            logger.warning("Skipping unreadable saved schedule [%s]", row.id)
            continue
        if not config.is_active:
            continue
        ok = scheduler_worker.add_schedule(
            config=config,
            task_callable=scheduled_run_callback,
            schedule_id=config.schedule_id,
            user_id=config.user_id,
        )
        restored += 1 if ok else 0
    return restored


scheduler_worker = AutomationSchedulerWorker()
