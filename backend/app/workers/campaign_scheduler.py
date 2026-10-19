"""Fires saved campaign schedules (the "Safety & schedule" tab).

Before this, a schedule was stored and shown but nothing ever acted on it. Now a one-minute tick
finds due schedules and launches the campaign through the same code as the Run button
(`launch_campaign_run`), so every manual-run check applies: one live run per user, resume ownership,
connection check, daily/hourly limits, operating hours, approval band.

Rules:
* Enabling a schedule never fires immediately; the first run is at its next slot.
* `next_run_at` is moved forward BEFORE launching, so a failing campaign cannot be retried every minute.
* A slot more than STALE_AFTER late (server was down) is skipped, not run late.
* Outside the campaign's operating hours, or while the user has a run live, the slot is skipped.
* Never raises: every outcome is logged. `SCHEDULED_RUNS_ENABLED=false` stops all of it.
Like run recovery, this assumes a single backend process.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.core import database
from app.core.config import settings

logger = logging.getLogger("app.workers.campaign_scheduler")

STALE_AFTER = timedelta(hours=1)
SKIPPED_STATES = ("ARCHIVED", "COMPLETED")


def compute_next_run(
    cron_expression: Optional[str], interval_minutes: Optional[int], now: datetime, tz_name: str = "UTC"
) -> Optional[datetime]:
    """Next firing time after `now`, or None when the schedule has no valid cron/interval."""
    try:
        if cron_expression and cron_expression.strip():
            try:
                zone = ZoneInfo(tz_name or "UTC")
            except ZoneInfoNotFoundError:
                zone = ZoneInfo("UTC")
            trigger = CronTrigger.from_crontab(cron_expression.strip(), timezone=zone)
            nxt = trigger.get_next_fire_time(None, now.astimezone(zone))
            return nxt.astimezone(timezone.utc) if nxt else None
    except ValueError:
        return None
    if interval_minutes and interval_minutes > 0:
        return now + timedelta(minutes=interval_minutes)
    return None


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


async def _launch(user_id: str, campaign_id: str) -> Any:
    """The real launcher: builds its own repositories and calls the shared launch function."""
    from app.application.automation.orchestrator import orchestrator
    from app.application.campaigns.launch import LaunchOptions, launch_campaign_run
    from app.infrastructure.connections.connection_manager import ConnectionManager
    from app.infrastructure.database.repositories.campaign_repository import (
        SqlAlchemyCampaignActivityLogRepository,
        SqlAlchemyCampaignExecutionRepository,
        SqlAlchemyCampaignRepository,
    )
    from app.infrastructure.database.repositories.connection_repository import (
        SqlAlchemyBrowserSessionRepository,
        SqlAlchemyConnectionRepository,
    )
    from app.infrastructure.database.repositories.profile_repository import SqlAlchemyResumeRepository

    async with database.AsyncSessionLocal() as db:
        conn_repo = SqlAlchemyConnectionRepository(db)
        result = await launch_campaign_run(
            orchestrator=orchestrator,
            user_id=user_id,
            campaign_id=campaign_id,
            options=LaunchOptions(),
            campaign_repo=SqlAlchemyCampaignRepository(db),
            execution_repo=SqlAlchemyCampaignExecutionRepository(db),
            log_repo=SqlAlchemyCampaignActivityLogRepository(db),
            connection_manager=ConnectionManager(conn_repo, SqlAlchemyBrowserSessionRepository(db)),
            connection_repo=conn_repo,
            resume_repo=SqlAlchemyResumeRepository(db),
        )
        await db.commit()
        return result


async def run_due_campaign_schedules(
    now: Optional[datetime] = None,
    launch: Callable[[str, str], Awaitable[Any]] = _launch,
    live_run_lookup: Optional[Callable[[str], Awaitable[Optional[str]]]] = None,
) -> Dict[str, int]:
    """One tick. Returns counts: launched, skipped, armed (next slot set for the first time), failed."""
    from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator
    from app.infrastructure.database.models.models import CampaignModel, CampaignScheduleModel
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignRepository

    counts = {"launched": 0, "skipped": 0, "armed": 0, "failed": 0}
    if not settings.SCHEDULED_RUNS_ENABLED:
        return counts
    now = now or datetime.now(timezone.utc)
    if live_run_lookup is None:
        from app.application.automation.orchestrator import orchestrator

        live_run_lookup = orchestrator.get_live_run_id

    async with database.AsyncSessionLocal() as db:
        rows = (
            await db.execute(
                select(CampaignScheduleModel.id, CampaignScheduleModel.campaign_id, CampaignModel.user_id)
                .join(CampaignModel, CampaignModel.id == CampaignScheduleModel.campaign_id)
                .where(CampaignScheduleModel.is_active.is_(True), CampaignModel.state.notin_(SKIPPED_STATES))
            )
        ).all()

    for schedule_id, campaign_id, user_id in rows:
        try:
            async with database.AsyncSessionLocal() as db:
                sched = await db.get(CampaignScheduleModel, schedule_id)
                campaign = await SqlAlchemyCampaignRepository(db).get_by_id(campaign_id)
                if not sched or not sched.is_active or not campaign:
                    continue
                tz_name = getattr(campaign.safety_policy, "timezone", "UTC")
                due_at = _aware(sched.next_run_at)

                if due_at is None:  # just enabled: arm it, do not fire now
                    sched.next_run_at = compute_next_run(sched.cron_expression, sched.interval_minutes, now, tz_name)
                    await db.commit()
                    counts["armed"] += 1
                    continue
                if due_at > now:
                    continue

                # Move the slot forward first; whatever happens next, this slot is consumed.
                sched.next_run_at = compute_next_run(sched.cron_expression, sched.interval_minutes, now, tz_name)
                late = now - due_at
                await db.commit()

            if late > STALE_AFTER:
                logger.info("Campaign [%s] slot skipped: %s late (server was down?).", campaign_id, late)
                counts["skipped"] += 1
                continue
            if not SafetyPolicyEvaluator.is_within_operating_window(campaign.safety_policy, now):
                logger.info("Campaign [%s] slot skipped: outside its operating hours.", campaign_id)
                counts["skipped"] += 1
                continue
            live = await live_run_lookup(user_id)
            if live:
                logger.info("Campaign [%s] slot skipped: run [%s] already active for the user.", campaign_id, live)
                counts["skipped"] += 1
                continue

            await launch(user_id, campaign_id)
            async with database.AsyncSessionLocal() as db:
                sched = await db.get(CampaignScheduleModel, schedule_id)
                if sched:
                    sched.last_run_at = now
                    await db.commit()
            counts["launched"] += 1
            logger.info("Campaign [%s] launched by its schedule.", campaign_id)
        except Exception as e:  # one bad campaign must not stop the others
            counts["failed"] += 1
            logger.error("Scheduled launch of campaign [%s] failed: %s", campaign_id, e)
    return counts
