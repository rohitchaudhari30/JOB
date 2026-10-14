"""Small helper for work that must not run inside a web request (AUT-14, JOB-02).

Tasks are remembered so they are not garbage-collected mid-run, errors are logged
instead of lost, and everything can be cancelled on shutdown or between tests.
"""
import asyncio
import logging
from typing import Any, Coroutine, Set

logger = logging.getLogger("app.background")

_tasks: Set["asyncio.Task[Any]"] = set()


def spawn(coro: Coroutine[Any, Any, Any], name: str = "background-task") -> "asyncio.Task[Any]":
    task = asyncio.create_task(coro, name=name)
    _tasks.add(task)

    def _finished(done: "asyncio.Task[Any]") -> None:
        _tasks.discard(done)
        if not done.cancelled() and done.exception() is not None:
            logger.error("Background task %s failed", name, exc_info=done.exception())

    task.add_done_callback(_finished)
    return task


def running_count() -> int:
    return len(_tasks)


async def cancel_all() -> None:
    tasks = list(_tasks)
    for task in tasks:
        task.cancel()
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)
