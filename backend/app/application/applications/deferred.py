"""Lets a use case "execute" an application without waiting for the browser (AUT-14).

Resume and reconcile first change the application's state and then run the full browser
flow. In a web request that can take minutes. This stand-in has the same `execute`
method as the real use case, but it only starts the run in the background and returns
the application as it is now. The caller can poll for the final state.
"""
from typing import Awaitable, Callable, Optional

from app.domain.applications.entities import Application
from app.domain.applications.repositories import ApplicationRepository


class DeferredExecuteUseCase:
    def __init__(
        self,
        app_repo: ApplicationRepository,
        commit: Callable[[], Awaitable[None]],
        start_in_background: Callable[[str], None],
    ):
        self._app_repo = app_repo
        self._commit = commit
        self._start = start_in_background
        self.scheduled = False

    async def execute(self, application_id: str, run_id: Optional[str] = None, headless: bool = True) -> Application:
        # Commit first: the background run uses its own session and must see the new state.
        await self._commit()
        self._start(application_id)
        self.scheduled = True
        return await self._app_repo.get_by_id(application_id)
