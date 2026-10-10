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
    auto_apply: bool = True
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

    def shutdown(self):
        if self._scheduler and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
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


scheduler_worker = AutomationSchedulerWorker()
