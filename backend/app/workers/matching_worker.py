import asyncio
import logging
from typing import Optional
import uuid
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.application.notifier import ws_manager

logger = logging.getLogger("app.workers.matching")


class MatchingWorker:
    """
    Durable, database-backed background matching worker.
    Processes queued matching tasks with atomic lease claiming, worker fencing,
    and bounded concurrency.
    """

    def __init__(
        self,
        worker_id: Optional[str] = None,
        max_concurrency: int = 5,
        poll_interval: float = 2.0,
    ):
        self.worker_id = worker_id or f"matching-worker-{uuid.uuid4().hex[:8]}"
        self.max_concurrency = max_concurrency
        self.poll_interval = poll_interval
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._semaphore = asyncio.Semaphore(self.max_concurrency)
        self._wakeup_event = asyncio.Event()

    def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(f"Started MatchingWorker [{self.worker_id}] (max_concurrency={self.max_concurrency})")

    def stop(self):
        self._running = False
        self._wakeup_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info(f"Stopped MatchingWorker [{self.worker_id}]")

    def notify_new_task(self):
        """Low-latency wakeup mechanism when tasks are enqueued."""
        self._wakeup_event.set()

    async def _run_loop(self):
        while self._running:
            try:
                claimed = await self._try_process_next_batch()
                if not claimed:
                    try:
                        await asyncio.wait_for(self._wakeup_event.wait(), timeout=self.poll_interval)
                    except asyncio.TimeoutError:
                        pass
                    finally:
                        self._wakeup_event.clear()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in MatchingWorker loop: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)

    async def _try_process_next_batch(self) -> bool:
        from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchingTaskRepository

        async with AsyncSessionLocal() as session:
            task_repo = SqlAlchemyMatchingTaskRepository(session)
            claimed_task = await task_repo.claim_next_task(
                worker_id=self.worker_id,
                lease_seconds=120,
            )
            if not claimed_task:
                return False
            await session.commit()

        # Process task concurrently within bounded semaphore
        asyncio.create_task(self._process_single_task(claimed_task))
        return True

    async def _process_single_task(self, task):
        from app.infrastructure.ai.gateway import MultiTierAIGateway
        from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
        from app.infrastructure.database.repositories.matching_repository import (
            SqlAlchemyMatchingTaskRepository,
            SqlAlchemyMatchResultRepository,
        )
        from app.infrastructure.database.repositories.profile_repository import (
            SqlAlchemyProfileRepository,
            SqlAlchemyResumeRepository,
        )
        from app.application.matching.use_cases import EvaluateJobMatchUseCase

        async with self._semaphore:
            async with AsyncSessionLocal() as session:
                task_repo = SqlAlchemyMatchingTaskRepository(session)
                try:
                    match_repo = SqlAlchemyMatchResultRepository(session)
                    job_repo = SqlAlchemyJobRepository(session)
                    profile_repo = SqlAlchemyProfileRepository(session)
                    resume_repo = SqlAlchemyResumeRepository(session)
                    ai_gw = MultiTierAIGateway(session=session)

                    eval_uc = EvaluateJobMatchUseCase(
                        profile_repo=profile_repo,
                        job_repo=job_repo,
                        match_repo=match_repo,
                        resume_repo=resume_repo,
                        ai_gateway=ai_gw,
                    )

                    match_res = await eval_uc.execute(
                        user_id=task.user_id,
                        job_id=task.job_id,
                        resume_id=task.resume_id,
                    )

                    await task_repo.complete_task(
                        task_id=task.id,
                        worker_id=self.worker_id,
                        lease_version=task.lease_version,
                    )
                    await session.commit()

                    # Broadcast real-time telemetry event
                    await ws_manager.broadcast_to_user(
                        user_id=task.user_id,
                        message={
                            "type": "MATCH_EVENT",
                            "event_name": "JOB_SCORED",
                            "payload": {
                                "job_id": task.job_id,
                                "match_score": match_res.match_score,
                                "recommendation_score": match_res.recommendation_score,
                                "decision": match_res.decision.value if hasattr(match_res.decision, "value") else str(match_res.decision),
                                "title": match_res.job_title,
                                "company": match_res.company,
                            },
                        },
                    )
                    logger.info(
                        f"MatchingWorker evaluated task [{task.id}]: "
                        f"Job [{task.job_id}] vs User [{task.user_id}] -> Score={match_res.match_score}% ({match_res.decision.value})"
                    )

                except Exception as eval_err:
                    logger.warning(f"MatchingWorker failed evaluation for task [{task.id}]: {eval_err}")
                    await session.rollback()
                    async with AsyncSessionLocal() as err_session:
                        err_task_repo = SqlAlchemyMatchingTaskRepository(err_session)
                        await err_task_repo.fail_task(
                            task_id=task.id,
                            worker_id=self.worker_id,
                            lease_version=task.lease_version,
                            error_message=str(eval_err),
                            retryable=True,
                        )
                        await err_session.commit()


matching_worker = MatchingWorker(
    max_concurrency=getattr(settings, "MATCHING_MAX_CONCURRENCY", 5),
)
