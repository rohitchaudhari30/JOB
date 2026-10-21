"""Durable background worker for resume tailoring.

Work is a database row (QUEUED or GENERATE_QUEUED). The worker leases one row at a time, runs the stage, and writes the
result back. A crashed worker's lease expires and the row is picked up again, up to TAILORING_MAX_ATTEMPTS times.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.application.resume_tailoring.analysis import fail, run_analysis
from app.application.resume_tailoring.common import release_lease
from app.application.resume_tailoring.generation import run_generation
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import AIProviderException
from app.domain.resume_tailoring.entities import TailoredResume
from app.domain.resume_tailoring.status import TailoringStatus

logger = logging.getLogger("app.workers.tailoring")

LEASE_SECONDS = 300
HOUSEKEEPING_EVERY_SECONDS = 3600


class TailoringWorker:
    def __init__(self, worker_id: Optional[str] = None, max_concurrency: int = 2, poll_interval: float = 2.0):
        self.worker_id = worker_id or f"tailoring-worker-{uuid.uuid4().hex[:8]}"
        self.max_concurrency = max_concurrency
        self.poll_interval = poll_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._wakeup = asyncio.Event()
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._last_housekeeping = 0.0

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("Started %s", self.worker_id)

    def stop(self) -> None:
        self._running = False
        self._wakeup.set()
        if self._task and not self._task.done():
            self._task.cancel()

    def notify(self) -> None:
        self._wakeup.set()

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._housekeeping()
                if not await self.process_one():
                    try:
                        await asyncio.wait_for(self._wakeup.wait(), timeout=self.poll_interval)
                    except asyncio.TimeoutError:
                        pass
                    finally:
                        self._wakeup.clear()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Tailoring worker loop error")
                await asyncio.sleep(self.poll_interval)

    async def _housekeeping(self) -> None:
        import time

        if time.monotonic() - self._last_housekeeping < HOUSEKEEPING_EVERY_SECONDS:
            return
        self._last_housekeeping = time.monotonic()
        from app.infrastructure.tailoring_factory import build_tailoring_service

        async with AsyncSessionLocal() as session:
            removed = await build_tailoring_service(session).expire_drafts()
            await session.commit()
        if removed:
            logger.info("Removed %d expired tailoring drafts", removed)

    async def process_one(self) -> bool:
        """Claims and runs one piece of work. Returns False when there was nothing to do."""
        from app.infrastructure.database.repositories.tailored_resume_repository import SqlAlchemyTailoredResumeRepository

        async with AsyncSessionLocal() as session:
            claimed = await SqlAlchemyTailoredResumeRepository(session).claim_next(self.worker_id, LEASE_SECONDS)
            await session.commit()
        if not claimed:
            return False
        item, stage = claimed
        async with self._semaphore:
            await self._run(item, stage)
        return True

    async def _run(self, claimed: TailoredResume, stage: str) -> None:
        from app.infrastructure.tailoring_factory import build_tailoring_deps

        async with AsyncSessionLocal() as session:
            deps = build_tailoring_deps(session)
            try:
                item = await deps.tailored.get(claimed.id)
                expected = TailoringStatus.ANALYZING if stage == "analyze" else TailoringStatus.GENERATING
                if item is None or item.status != expected or item.lease_owner != self.worker_id:
                    return  # cancelled or taken over while we were waiting
                if stage == "analyze":
                    item = await run_analysis(deps, item, settings.TAILORING_MAX_ATTEMPTS)
                else:
                    item = await run_generation(deps, item)
                current = await deps.tailored.get(item.id)
                if current is None or current.status != expected:
                    return  # the user cancelled during the work; do not overwrite that
                await deps.tailored.save(item)
                await session.commit()
            except AIProviderException as error:
                await session.rollback()
                await self._retry_or_fail(claimed.id, stage, "AI_UNAVAILABLE", "The AI service is unavailable right now.", str(error))
            except Exception as error:  # noqa: BLE001 - a worker must never die on one bad item
                await session.rollback()
                logger.exception("Tailoring %s failed", claimed.id)
                await self._retry_or_fail(claimed.id, stage, "INTERNAL_ERROR", "Something went wrong while tailoring.", type(error).__name__)

    async def _retry_or_fail(self, tailored_id: str, stage: str, code: str, message: str, log_detail: str) -> None:
        from app.infrastructure.tailoring_factory import build_tailoring_deps

        logger.warning("Tailoring %s (%s) failed: %s", tailored_id, stage, log_detail[:200])
        async with AsyncSessionLocal() as session:
            deps = build_tailoring_deps(session)
            item = await deps.tailored.get(tailored_id)
            if item is None or item.status not in (TailoringStatus.ANALYZING, TailoringStatus.GENERATING):
                return
            if item.attempt_count < settings.TAILORING_MAX_ATTEMPTS:
                item.status = TailoringStatus.QUEUED if stage == "analyze" else TailoringStatus.GENERATE_QUEUED
                release_lease(item)
            else:
                fail(item, code, message)
            await deps.tailored.save(item)
            await session.commit()
        self.notify()


tailoring_worker = TailoringWorker(max_concurrency=settings.TAILORING_MAX_CONCURRENCY)
