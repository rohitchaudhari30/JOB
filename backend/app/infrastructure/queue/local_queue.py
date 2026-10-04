import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Callable, Dict

logger = logging.getLogger("app.queue")


class TaskQueue(ABC):
    @abstractmethod
    async def enqueue(self, task_name: str, payload: Dict[str, Any]) -> str:
        pass

    @abstractmethod
    def register_handler(self, task_name: str, handler: Callable):
        pass


class LocalTaskQueue(TaskQueue):
    """
    In-process async task queue for Phase 1 development.
    Uses asyncio background tasks without blocking HTTP handlers.
    """
    def __init__(self):
        self._handlers: Dict[str, Callable] = {}

    def register_handler(self, task_name: str, handler: Callable):
        self._handlers[task_name] = handler
        logger.info(f"Registered local task handler for: {task_name}")

    async def enqueue(self, task_name: str, payload: Dict[str, Any]) -> str:
        if task_name not in self._handlers:
            raise ValueError(f"No handler registered for task '{task_name}'")

        handler = self._handlers[task_name]

        # Launch non-blocking background task
        asyncio.create_task(self._execute_safe(task_name, handler, payload))
        return f"local_task_{task_name}"

    async def _execute_safe(self, task_name: str, handler: Callable, payload: Dict[str, Any]):
        try:
            logger.info(f"Executing task [{task_name}] with payload keys: {list(payload.keys())}")
            await handler(payload)
            logger.info(f"Completed task [{task_name}] successfully.")
        except Exception as e:
            logger.error(f"Error executing task [{task_name}]: {e}", exc_info=True)


local_task_queue = LocalTaskQueue()
