import asyncio
import json
import logging
import sys
import threading
from typing import Optional
from playwright.async_api import Browser, BrowserContext, Page, Playwright, async_playwright
from app.core.config import settings
from app.core.security import session_encryptor

logger = logging.getLogger("app.browser.manager")


class ProactorLoopThread:
    """Dedicated Proactor event loop thread for Playwright subprocess execution on Windows."""

    def __init__(self):
        if sys.platform == "win32":
            self.loop = asyncio.ProactorEventLoop()
        else:
            self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True, name="PlaywrightProactorThread")
        self.thread.start()

    def run_coro(self, coro):
        future = asyncio.run_coroutine_threadsafe(coro, self.loop)
        return asyncio.wrap_future(future)

    def stop(self):
        try:
            self.loop.call_soon_threadsafe(self.loop.stop)
        except Exception:
            pass


class PlaywrightBrowserManager:
    """Manages the global Playwright browser pool and context lifecycles."""

    def __init__(self):
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._lock = asyncio.Lock()
        self._proactor_bridge: Optional[ProactorLoopThread] = None

    def _needs_bridge(self) -> bool:
        if sys.platform != "win32":
            return False
        try:
            loop = asyncio.get_running_loop()
            return not isinstance(loop, asyncio.ProactorEventLoop)
        except Exception:
            return True

    async def _start_playwright_instance(self):
        if not self._playwright:
            self._playwright = await async_playwright().start()
            launch_args = [
                "--disable-blink-features=AutomationControlled",
                "--disable-infobars",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
            ]
            self._browser = await self._playwright.chromium.launch(
                headless=settings.BROWSER_HEADLESS,
                args=launch_args,
            )
            logger.info(f"Playwright Chromium browser launched (headless={settings.BROWSER_HEADLESS}).")

    async def initialize(self):
        """Launches the global Chromium browser instance."""
        async with self._lock:
            if not self._browser:
                if self._needs_bridge():
                    if not self._proactor_bridge:
                        self._proactor_bridge = ProactorLoopThread()
                    await self._proactor_bridge.run_coro(self._start_playwright_instance())
                else:
                    await self._start_playwright_instance()

    async def get_browser(self) -> Browser:
        if not self._browser:
            await self.initialize()
        return self._browser  # type: ignore

    async def _create_context_internal(
        self,
        encrypted_storage_state: Optional[str] = None,
        viewport_width: int = 1280,
        viewport_height: int = 800,
    ) -> BrowserContext:
        browser = await self.get_browser()

        storage_state_dict = None
        if encrypted_storage_state:
            try:
                storage_state_dict = session_encryptor.decrypt_json(encrypted_storage_state)
            except Exception as e:
                logger.warning(f"Failed to decrypt storage_state: {e}. Launching clean context.")

        context = await browser.new_context(
            storage_state=storage_state_dict,
            viewport={"width": viewport_width, "height": viewport_height},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="Asia/Kolkata",
        )

        # Apply stealth overrides to context
        await context.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = {
                runtime: {}
            };
            """
        )
        return context

    async def _create_headed_session_internal(
        self,
        storage_state_dict: Optional[dict] = None,
        viewport_width: int = 1280,
        viewport_height: int = 800,
    ) -> tuple[BrowserContext, Page]:
        if not self._playwright:
            self._playwright = await async_playwright().start()

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--no-sandbox",
            "--disable-setuid-sandbox",
        ]
        headed_browser = await self._playwright.chromium.launch(
            headless=False,
            args=launch_args,
        )
        context = await headed_browser.new_context(
            storage_state=storage_state_dict,
            viewport={"width": viewport_width, "height": viewport_height},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="Asia/Kolkata",
        )
        await context.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            window.chrome = {
                runtime: {}
            };
            """
        )
        page = await context.new_page()

        # Wrap context.close to also close the dedicated headed browser instance
        orig_close = context.close

        async def _close_with_browser():
            try:
                await orig_close()
            finally:
                try:
                    await headed_browser.close()
                except Exception:
                    pass

        context.close = _close_with_browser  # type: ignore
        return context, page

    async def create_context(
        self,
        headless: bool = True,
        encrypted_storage_state: Optional[str] = None,
        viewport_width: int = 1280,
        viewport_height: int = 800,
    ) -> tuple[BrowserContext, Page]:
        """
        Creates a BrowserContext and initial Page.
        Supports headed mode for interactive user logins and OTP resolution.
        """
        storage_state_dict = None
        if encrypted_storage_state:
            try:
                storage_state_dict = session_encryptor.decrypt_json(encrypted_storage_state)
            except Exception as e:
                logger.warning(f"Failed to decrypt storage_state: {e}")

        if not headless:
            if self._needs_bridge():
                if not self._proactor_bridge:
                    self._proactor_bridge = ProactorLoopThread()
                return await self._proactor_bridge.run_coro(
                    self._create_headed_session_internal(storage_state_dict, viewport_width, viewport_height)
                )
            return await self._create_headed_session_internal(storage_state_dict, viewport_width, viewport_height)

        if self._needs_bridge():
            if not self._proactor_bridge:
                self._proactor_bridge = ProactorLoopThread()
            context = await self._proactor_bridge.run_coro(
                self._create_context_internal(encrypted_storage_state, viewport_width, viewport_height)
            )
            page = await self._proactor_bridge.run_coro(context.new_page())
            return context, page

        context = await self._create_context_internal(encrypted_storage_state, viewport_width, viewport_height)
        page = await context.new_page()
        return context, page

    async def create_authenticated_context(
        self,
        storage_state: str | dict,
        headless: bool = True,
        viewport_width: int = 1280,
        viewport_height: int = 800,
    ) -> tuple[BrowserContext, Page]:
        """Helper to create an authenticated context from raw JSON string or dict storage state."""
        storage_state_dict = storage_state if isinstance(storage_state, dict) else json.loads(storage_state)

        if not headless:
            if self._needs_bridge():
                if not self._proactor_bridge:
                    self._proactor_bridge = ProactorLoopThread()
                return await self._proactor_bridge.run_coro(
                    self._create_headed_session_internal(storage_state_dict, viewport_width, viewport_height)
                )
            return await self._create_headed_session_internal(storage_state_dict, viewport_width, viewport_height)

        if self._needs_bridge():
            if not self._proactor_bridge:
                self._proactor_bridge = ProactorLoopThread()
            browser = await self._proactor_bridge.run_coro(self.get_browser())
            context = await self._proactor_bridge.run_coro(
                browser.new_context(
                    storage_state=storage_state_dict,
                    viewport={"width": viewport_width, "height": viewport_height},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/128.0.0.0 Safari/537.36"
                    ),
                    locale="en-US",
                    timezone_id="Asia/Kolkata",
                )
            )
            page = await self._proactor_bridge.run_coro(context.new_page())
            return context, page

        browser = await self.get_browser()
        context = await browser.new_context(
            storage_state=storage_state_dict,
            viewport={"width": viewport_width, "height": viewport_height},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            timezone_id="Asia/Kolkata",
        )
        page = await context.new_page()
        return context, page

    async def create_isolated_context(
        self,
        encrypted_storage_state: Optional[str] = None,
        viewport_width: int = 1280,
        viewport_height: int = 800,
    ) -> BrowserContext:
        """
        Creates an isolated, sandboxed BrowserContext for a specific user session.
        Injects decrypted session cookies and stealth evasion scripts.
        """
        if self._needs_bridge():
            if not self._proactor_bridge:
                self._proactor_bridge = ProactorLoopThread()
            return await self._proactor_bridge.run_coro(
                self._create_context_internal(encrypted_storage_state, viewport_width, viewport_height)
            )
        return await self._create_context_internal(encrypted_storage_state, viewport_width, viewport_height)

    async def _shutdown_internal(self):
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None
        logger.info("Playwright Chromium browser closed.")

    async def shutdown(self):
        """Closes the browser pool on application shutdown."""
        async with self._lock:
            if self._proactor_bridge:
                try:
                    await self._proactor_bridge.run_coro(self._shutdown_internal())
                    self._proactor_bridge.stop()
                    self._proactor_bridge = None
                except Exception:
                    pass
            else:
                await self._shutdown_internal()


browser_manager = PlaywrightBrowserManager()
