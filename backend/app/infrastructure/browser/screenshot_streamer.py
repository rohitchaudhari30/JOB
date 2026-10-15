import asyncio
import base64
import logging
from typing import Optional
from playwright.async_api import CDPSession, Page
from app.application.notifier import ws_manager

logger = logging.getLogger("app.browser.cdp_streamer")


class CDPScreencastStreamer:
    """
    Industry-standard browser visual streamer using Chrome DevTools Protocol (CDP) Screencast.
    
    Architectural Principles:
    1. Native Compositor Hook: Chromium pushes frames directly from its GPU/Blink engine
       without freezing or blocking Playwright automation actions.
    2. Zero Database Footprint: Frames exist strictly in volatile memory and stream directly
       to the WebSocket client. No files or database tables are ever touched.
    3. Latest-Frame Strategy (Drop-Old): Uses a 1-slot buffer. Slow clients/networks never
       cause frame accumulation or lag; old frames are instantly replaced by the newest frame.
    4. Binary WebSocket Transport: Frames are broadcast as raw JPEG binary bytes, eliminating
       33% base64 encoding bloat and CPU overhead.
    5. Decoupled Observability: Automation execution never waits on the viewer.
    """

    def __init__(
        self,
        page: Page,
        user_id: str,
        run_id: str,
        fps: int = 30,
        quality: int = 65,
        max_width: int = 1280,
        max_height: int = 720,
    ):
        self._page = page
        self._user_id = user_id
        self._run_id = run_id
        self._quality = min(max(quality, 30), 85)
        self._max_width = max_width
        self._max_height = max_height
        self._cdp: Optional[CDPSession] = None
        self._is_running = False
        
        # Latest-frame bounded buffer (1-slot)
        self._latest_frame_bytes: Optional[bytes] = None
        self._frame_ready_event = asyncio.Event()
        self._dispatch_task: Optional[asyncio.Task] = None
        self._last_streamed_url: str = ""

    def start(self):
        """Starts the native CDP screencast and background frame dispatcher."""
        if not self._is_running:
            self._is_running = True
            self._dispatch_task = asyncio.create_task(self._run_cdp_stream())
            logger.info(f"CDP Screencast Streamer started for run [{self._run_id}] (user={self._user_id}).")

    async def stop(self):
        """Gracefully stops the CDP screencast session and closes resources."""
        self._is_running = False
        self._frame_ready_event.set()

        if self._cdp:
            try:
                if not self._page.is_closed():
                    await self._cdp.send("Page.stopScreencast")
                await self._cdp.detach()
            except Exception:
                pass
            self._cdp = None

        if self._dispatch_task:
            self._dispatch_task.cancel()
            try:
                await self._dispatch_task
            except asyncio.CancelledError:
                pass
            self._dispatch_task = None

        self._latest_frame_bytes = None
        logger.info(f"CDP Screencast Streamer stopped for run [{self._run_id}].")

    async def _run_cdp_stream(self):
        """Initializes CDP session on the page and handles native compositor screencast events."""
        try:
            if self._page.is_closed():
                return

            # 1. Attach native Chromium CDP session
            self._cdp = await self._page.context.new_cdp_session(self._page)

            # 2. Register native screencast frame handler
            self._cdp.on("Page.screencastFrame", self._on_screencast_frame)

            # 3. Request native screencast from Chromium compositor
            await self._cdp.send(
                "Page.startScreencast",
                {
                    "format": "jpeg",
                    "quality": self._quality,
                    "maxWidth": self._max_width,
                    "maxHeight": self._max_height,
                    "everyNthFrame": 1,
                },
            )

            # 4. Run dispatch loop that sends only the latest frame over binary WebSocket
            await self._dispatch_loop()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"CDP screencast encountered non-fatal error: {e}")

    def _on_screencast_frame(self, params: dict):
        """Chromium callback: pushes frame data when pixels change."""
        if not self._is_running:
            return

        session_id = params.get("sessionId")
        data_b64 = params.get("data")

        # Flow control: acknowledge the frame back to Chromium immediately
        if self._cdp and session_id:
            asyncio.create_task(self._ack_frame(session_id))

        if data_b64:
            try:
                # Store latest frame (overwriting any unsent previous frame)
                self._latest_frame_bytes = base64.b64decode(data_b64)
                self._frame_ready_event.set()
            except Exception:
                pass

    async def _ack_frame(self, session_id: int):
        try:
            if self._cdp and not self._page.is_closed():
                await self._cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
        except Exception:
            pass

    async def _dispatch_loop(self):
        """Dispatches the latest frame to the WebSocket client, dropping stale frames."""
        while self._is_running:
            await self._frame_ready_event.wait()
            self._frame_ready_event.clear()

            frame_data = self._latest_frame_bytes
            if frame_data and self._is_running:
                # 1. Broadcast binary frame over WebSocket (0 database bytes)
                await ws_manager.broadcast_bytes_to_user(self._user_id, frame_data)

                # 2. Check and dispatch URL change control event if navigation occurred
                try:
                    current_url = getattr(self._page, "url", None) or ""
                    if current_url and current_url != self._last_streamed_url:
                        self._last_streamed_url = current_url
                        await ws_manager.broadcast_to_user(
                            self._user_id,
                            {
                                "type": "BROWSER_NAVIGATED",
                                "run_id": self._run_id,
                                "url": current_url,
                            },
                        )
                except Exception:
                    pass

            # Yield control so event loop remains ultra responsive
            await asyncio.sleep(0.016)  # ~60 FPS max cap for network efficiency


# Alias for seamless drop-in backwards compatibility
ScreenshotStreamer = CDPScreencastStreamer
