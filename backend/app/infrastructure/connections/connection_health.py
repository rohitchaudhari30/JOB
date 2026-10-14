import asyncio
from datetime import datetime, timezone
from typing import Optional
from app.core.logging import logger
from app.core.security import session_crypto
from app.domain.connections.entities import ConnectionStatus, PlatformCategory, PlatformManifest
from app.infrastructure.browser.browser_manager import browser_manager
from app.infrastructure.connections.manifests import PlatformManifestRegistry


class ConnectionHealthChecker:
    @staticmethod
    async def check_health(platform_id: str, encrypted_storage_state: Optional[str]) -> ConnectionStatus:
        manifest = PlatformManifestRegistry.get(platform_id)
        if not manifest:
            return ConnectionStatus.ERROR

        # Type B (ATS): Public access is always connected
        if manifest.category == PlatformCategory.ATS_APPLICATION or not manifest.is_auth_required:
            return ConnectionStatus.CONNECTED

        if not encrypted_storage_state:
            return ConnectionStatus.NOT_CONNECTED

        try:
            # Decrypt storage state
            state_json = session_crypto.decrypt_storage_state(encrypted_storage_state)
            if not state_json or len(state_json) < 10:
                return ConnectionStatus.SESSION_EXPIRED

            # Probe live session using Playwright
            context, page = await browser_manager.create_authenticated_context(
                state_json,
                headless=True
            )
            try:
                if platform_id == "naukri":
                    await page.goto("https://www.naukri.com/mnjuser/profile", timeout=12000, wait_until="domcontentloaded")
                    url = page.url
                    # If redirected to login, session has expired
                    if "login" in url.lower() or "nlogin" in url.lower():
                        logger.info(f"Health probe for {platform_id}: Session expired (redirected to {url})")
                        return ConnectionStatus.REAUTH_REQUIRED
                    return ConnectionStatus.CONNECTED

                elif platform_id == "linkedin":
                    await page.goto("https://www.linkedin.com/feed/", timeout=12000, wait_until="domcontentloaded")
                    url = page.url
                    if "login" in url.lower() or "authwall" in url.lower() or "checkpoint" in url.lower():
                        logger.info(f"Health probe for {platform_id}: Session expired (redirected to {url})")
                        return ConnectionStatus.REAUTH_REQUIRED
                    return ConnectionStatus.CONNECTED

                else:
                    return ConnectionStatus.CONNECTED
            finally:
                await context.close()

        except Exception as e:
            logger.warning(f"Health check probe error for {platform_id}: {e}")
            # A network error or timeout says nothing about the login, so it is an ERROR,
            # not a request to log in again (CON-03).
            return ConnectionStatus.ERROR
