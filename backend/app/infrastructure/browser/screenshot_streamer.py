import asyncio
import base64
import logging
from typing import Optional
from playwright.async_api import Page
from app.api.v1.ws import ws_manager

logger = logging.getLogger("app.browser.streamer")


class ScreenshotStreamer:
    """Streams live browser visual frames (base64 JPEG) to the WebSocket Live Console."""

    def __init__(self, page: Page, user_id: str, run_id: str, fps: int = 5):
        self._page = page
        self._user_id = user_id
        self._run_id = run_id
        self._interval = 1.0 / max(1, min(fps, 10))  # Throttled between 1 and 10 FPS
        self._is_running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._capture_loop())
            logger.info(f"Started live visual streaming for run [{self._run_id}] to user [{self._user_id}].")

    async def stop(self):
        self._is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info(f"Stopped live visual streaming for run [{self._run_id}].")

    async def _capture_loop(self):
        while self._is_running:
            try:
                if not self._page.is_closed():
                    # Capture optimized JPEG frame
                    screenshot_bytes = await self._page.screenshot(
                        type="jpeg",
                        quality=50,
                        full_page=False,
                    )
                    b64_frame = base64.b64encode(screenshot_bytes).decode("utf-8")

                    # Broadcast to user WebSocket
                    await ws_manager.broadcast_to_user(
                        user_id=self._user_id,
                        message={
                            "type": "BROWSER_FRAME",
                            "run_id": self._run_id,
                            "frame_jpeg_base64": b64_frame,
                        },
                    )
            except Exception as e:
                # Silently catch frame drop during rapid page navigation
                pass
            await asyncio.sleep(self._interval)
