import asyncio
import logging
import signal
import sys
from typing import Any, Dict
from app.application.automation.orchestrator import orchestrator
from app.core.config import settings
from app.infrastructure.queue.local_queue import TaskQueue, local_task_queue

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.worker.automation")


class AutomationWorker:
    """
    Dedicated worker process / runner for background Playwright automation runs.
    Decoupled from FastAPI HTTP request-response cycle.
    """

    def __init__(self, queue: TaskQueue = local_task_queue, worker_id: str = "worker-1"):
        self.queue = queue
        self.worker_id = worker_id
        self._running = False
        self._active_tasks = 0

    def start(self):
        """Registers handlers and begins listening for automation run tasks."""
        self._running = True
        self.queue.register_handler("run_automation_pipeline", self.handle_automation_task)
        logger.info(f"AutomationWorker [{self.worker_id}] started and ready to process runs.")

    async def handle_automation_task(self, payload: Dict[str, Any]):
        """Processes an individual automation job execution payload."""
        self._active_tasks += 1
        run_id = payload.get("run_id", "unknown")
        user_id = payload.get("user_id")
        logger.info(f"[{self.worker_id}] Processing automation run [{run_id}] for user [{user_id}]...")
        try:
            # Delegate to orchestrator pipeline with isolated worker tracking
            session = orchestrator.get_session(run_id)
            if not session:
                logger.warning(f"Session [{run_id}] not found in orchestrator registry.")
                return

            logger.info(f"[{self.worker_id}] Session [{run_id}] active state: {session.status.value}")
        except Exception as e:
            logger.error(f"[{self.worker_id}] Failure processing run [{run_id}]: {e}", exc_info=True)
        finally:
            self._active_tasks -= 1

    def stop(self):
        """Gracefully shuts down worker process."""
        logger.info(f"Stopping AutomationWorker [{self.worker_id}]...")
        self._running = False


automation_worker = AutomationWorker()


if __name__ == "__main__":
    logger.info("Starting standalone automation worker daemon...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    worker = AutomationWorker(worker_id="standalone-worker-main")
    worker.start()

    def shutdown_signal():
        logger.info("Termination signal received. Shutting down worker...")
        worker.stop()
        loop.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, shutdown_signal)
        except (NotImplementedError, RuntimeError):
            pass

    try:
        loop.run_forever()
    finally:
        loop.close()
