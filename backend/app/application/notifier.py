"""A small seam between the application layer and the live-update transport (ARC-01).

The application and infrastructure code call `ws_manager.broadcast_to_user(...)` here
without importing anything from the API layer. The API layer registers the real
WebSocket manager when it loads. If nothing is registered (a script, a worker), the
calls quietly do nothing.
"""
from typing import Any


class _NoopNotifier:
    async def broadcast_to_user(self, user_id: str, message: Any) -> None:
        return None

    async def broadcast_bytes_to_user(self, user_id: str, data: bytes) -> None:
        return None


class _NotifierProxy:
    def __init__(self) -> None:
        self._target: Any = _NoopNotifier()

    def register(self, target: Any) -> None:
        self._target = target

    def __getattr__(self, name: str) -> Any:
        # Looked up on every call, so patching the real manager still works.
        return getattr(self._target, name)


ws_manager = _NotifierProxy()
