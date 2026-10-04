import logging
import os
from pathlib import Path
from typing import Optional
from playwright.async_api import BrowserContext, Page
from app.core.config import settings

logger = logging.getLogger("app.browser.trace_manager")


class TraceManager:
    """Manages failure screenshots and Playwright trace (.zip) recordings for debugging."""

    def __init__(self, base_storage_dir: Optional[str] = None):
        self._base_dir = Path(base_storage_dir or settings.STORAGE_DIR)
        self._screenshots_dir = self._base_dir / "screenshots"
        self._traces_dir = self._base_dir / "traces"
        self._ensure_dirs()

    def _ensure_dirs(self):
        self._screenshots_dir.mkdir(parents=True, exist_ok=True)
        self._traces_dir.mkdir(parents=True, exist_ok=True)

    async def start_tracing(self, context: BrowserContext, screenshots: bool = True, snapshots: bool = True):
        """Starts Playwright event and DOM tracing on the context."""
        try:
            await context.tracing.start(
                screenshots=screenshots,
                snapshots=snapshots,
                sources=True,
            )
            logger.info("Browser tracing started.")
        except Exception as e:
            logger.warning(f"Failed to start browser tracing: {e}")

    async def capture_failure_artifacts(
        self,
        application_id: str,
        page: Optional[Page] = None,
        context: Optional[BrowserContext] = None,
    ) -> tuple[Optional[str], Optional[str]]:
        """
        Captures full-page screenshot and exports Playwright trace .zip.
        Returns (screenshot_path, trace_path).
        """
        screenshot_path = None
        trace_path = None

        if page and not page.is_closed():
            try:
                dest = self._screenshots_dir / f"{application_id}.png"
                await page.screenshot(path=str(dest), full_page=True)
                screenshot_path = str(dest)
                logger.info(f"Captured failure screenshot at {screenshot_path}")
            except Exception as e:
                logger.error(f"Failed to capture failure screenshot: {e}")

        if context:
            try:
                dest_trace = self._traces_dir / f"{application_id}.zip"
                await context.tracing.stop(path=str(dest_trace))
                trace_path = str(dest_trace)
                logger.info(f"Captured Playwright trace at {trace_path}")
            except Exception as e:
                logger.warning(f"Failed to stop/export tracing: {e}")

        return screenshot_path, trace_path


trace_manager = TraceManager()
