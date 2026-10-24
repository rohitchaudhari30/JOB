import asyncio
import logging
from typing import Awaitable, Callable, Dict, Tuple, TypeVar

logger = logging.getLogger("app.application.matching.single_flight")

T = TypeVar("T")


class MatchingSingleFlight:
    """
    Coordinates in-flight matching evaluation requests.
    Prevents duplicate AI cascades, duplicate LLM token consumption,
    and unnecessary database collisions for concurrent requests with identical keys.
    """

    def __init__(self):
        self._flights: Dict[str, asyncio.Future] = {}
        self._lock = asyncio.Lock()

    async def execute_or_join(
        self,
        key: str,
        factory: Callable[[], Awaitable[T]],
    ) -> Tuple[T, bool]:
        """
        Executes factory if leader for `key`, or joins and awaits existing in-flight future.
        Returns: (result, is_leader)
        """
        async with self._lock:
            if key in self._flights:
                fut = self._flights[key]
                is_leader = False
            else:
                loop = asyncio.get_running_loop()
                fut = loop.create_future()
                self._flights[key] = fut
                is_leader = True

        if not is_leader:
            logger.debug(f"SingleFlight join: awaiting in-flight evaluation for key [{key[:16]}]")
            result = await fut
            return result, False

        try:
            logger.debug(f"SingleFlight leader: executing evaluation for key [{key[:16]}]")
            res = await factory()
            if not fut.done():
                fut.set_result(res)
            return res, True
        except BaseException as exc:
            if not fut.done():
                fut.set_exception(exc)
            raise
        finally:
            async with self._lock:
                self._flights.pop(key, None)


matching_single_flight = MatchingSingleFlight()
