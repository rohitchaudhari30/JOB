"""Small in-process rate limiter for auth endpoints (SEC-06).

State lives in this process only. If the API ever runs as several processes,
move the counters to a shared store (see roadmap item G-04).
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import settings

_hits: dict[tuple[str, str], deque] = defaultdict(deque)


def reset_rate_limits() -> None:
    _hits.clear()


def rate_limit(scope: str):
    """FastAPI dependency: allow N calls per window per client IP for this scope."""

    async def check(request: Request) -> None:
        limit = settings.AUTH_RATE_LIMIT_ATTEMPTS
        if limit <= 0:
            return
        window = settings.AUTH_RATE_LIMIT_WINDOW_SECONDS
        client = request.client.host if request.client else "unknown"
        calls = _hits[(scope, client)]
        now = time.monotonic()
        while calls and now - calls[0] > window:
            calls.popleft()
        if len(calls) >= limit:
            retry_after = max(1, int(window - (now - calls[0])))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please wait and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        calls.append(now)

    return check
