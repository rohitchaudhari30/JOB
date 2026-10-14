import os
import sys
import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from app.core.exceptions import EntityNotFoundException, PlatformException
from app.core.logging import logger
from app.core.security import session_encryptor
from app.domain.connections.contracts import ConnectionManagerInterface
from app.domain.connections.entities import (
    BrowserSession,
    ConnectionStatus,
    ConnectionType,
    PlatformCategory,
    PlatformConnection,
    PlatformManifest,
)
from app.domain.connections.repositories import BrowserSessionRepository, PlatformConnectionRepository
from app.infrastructure.browser.browser_manager import browser_manager
from app.infrastructure.connections.connection_health import ConnectionHealthChecker
from app.infrastructure.connections.manifests import PlatformManifestRegistry


class ConnectionManager(ConnectionManagerInterface):
    def __init__(
        self,
        connection_repo: PlatformConnectionRepository,
        session_repo: BrowserSessionRepository,
    ):
        self._connection_repo = connection_repo
        self._session_repo = session_repo

    async def list_connections(self, user_id: str) -> List[Dict]:
        """Lists all supported platforms merged with user connection and session state."""
        user_connections = await self._connection_repo.list_user_connections(user_id)
        user_conn_map = {c.platform: c for c in user_connections}

        results = []
        for manifest in PlatformManifestRegistry.list_all():
            conn = user_conn_map.get(manifest.platform_id)
            
            # Default state for public ATS or unauthenticated portals
            if manifest.category == PlatformCategory.ATS_APPLICATION or not manifest.is_auth_required:
                status = ConnectionStatus.CONNECTED
                session_active = True
                last_verified = None
            elif conn:
                status = conn.status
                session_active = conn.status == ConnectionStatus.CONNECTED
                last_verified = conn.last_verified_at
            else:
                status = ConnectionStatus.NOT_CONNECTED
                session_active = False
                last_verified = None

            results.append({
                "platform": manifest.platform_id,
                "display_name": manifest.display_name,
                "category": manifest.category.value,
                "connection_type": manifest.connection_type.value,
                "is_auth_required": manifest.is_auth_required,
                "status": status.value if hasattr(status, "value") else str(status),
                "session_active": session_active,
                "external_account_reference": conn.external_account_reference if conn else None,
                "last_verified_at": last_verified.isoformat() if last_verified else None,
                "capabilities": [c.value for c in manifest.capabilities],
                "description": manifest.description,
            })
        return results

    async def get_connection_status(self, user_id: str, platform: str) -> PlatformConnection:
        manifest = PlatformManifestRegistry.get(platform)
        if not manifest:
            raise EntityNotFoundException(f"Unsupported platform: {platform}")

        conn = await self._connection_repo.get_by_user_and_platform(user_id, platform)
        if not conn:
            conn = PlatformConnection(
                id=str(uuid.uuid4()),
                user_id=user_id,
                platform=platform,
                connection_type=manifest.connection_type,
                status=ConnectionStatus.NOT_CONNECTED,
            )
        return conn

    async def initiate_interactive_connect(self, user_id: str, platform: str) -> Dict:
        """Launches headed browser for user to log in interactively, then captures encrypted state."""
        manifest = PlatformManifestRegistry.get(platform)
        if not manifest:
            raise EntityNotFoundException(f"Unsupported platform: {platform}")

        if not manifest.is_auth_required:
            return {
                "platform": platform,
                "status": ConnectionStatus.CONNECTED.value,
                "message": f"{manifest.display_name} does not require an authenticated account.",
            }

        # A headed browser needs a screen on the machine running the API (CON-01).
        # In Docker or on a server there is none, so say so instead of failing oddly.
        if sys.platform.startswith("linux") and not os.environ.get("DISPLAY") and not os.environ.get("WAYLAND_DISPLAY"):
            return {
                "platform": platform,
                "status": ConnectionStatus.ERROR.value,
                "message": (
                    "This server has no display, so the login window cannot open here. "
                    "Run the app on a desktop machine to connect this platform. "
                    "A remote login flow is not built yet."
                ),
            }

        logger.info(f"Initiating interactive login for user [{user_id}] on platform [{platform}]...")
        
        # Launch headed browser so user can solve login/OTP themselves
        context, page = await browser_manager.create_context(headless=False)
        try:
            await page.goto(manifest.login_url, wait_until="domcontentloaded")
            logger.info(f"Opened {manifest.display_name} login page. Awaiting user authentication...")

            # Wait up to 120 seconds for user to log in (URL navigates away from login screen)
            authenticated = False
            for _ in range(60):
                await asyncio.sleep(2)
                current_url = page.url.lower()
                
                # Check for successful post-login redirection
                if platform == "naukri":
                    if ("mnjuser" in current_url or "homepage" in current_url or "mynaukri" in current_url) and "login" not in current_url:
                        authenticated = True
                        break
                elif platform == "linkedin":
                    if ("feed" in current_url or "mynetwork" in current_url or "jobs" in current_url) and "login" not in current_url and "checkpoint" not in current_url:
                        authenticated = True
                        break

            if not authenticated:
                logger.warning(f"Interactive login timed out or incomplete for [{platform}].")
                return {
                    "platform": platform,
                    "status": ConnectionStatus.REAUTH_REQUIRED.value,
                    "message": "Login timed out before verification completed. Please try again.",
                }

            # Capture storage state (cookies, local storage, tokens)
            storage_state = await context.storage_state()
            storage_json = json.dumps(storage_state)
            encrypted_state = session_encryptor.encrypt_storage_state(storage_json)

            # Extract user account identifier if visible
            account_ref = "Connected Account"
            try:
                if platform == "naukri":
                    user_elem = await page.query_selector(".user-name, .nI-gNb-drawer__user-name, .profile-name")
                    if user_elem:
                        text = (await user_elem.text_content() or "").strip()
                        if text:
                            account_ref = text
                elif platform == "linkedin":
                    user_elem = await page.query_selector(".feed-identity-module__actor-meta, h1.text-heading-xlarge, .profile-rail-card__actor-link")
                    if user_elem:
                        text = (await user_elem.text_content() or "").strip()
                        if text:
                            account_ref = text.split("\n")[0].strip()
            except Exception:
                pass

            # Upsert PlatformConnection in DB
            conn = await self._connection_repo.get_by_user_and_platform(user_id, platform)
            now = datetime.now(timezone.utc)
            if not conn:
                conn = PlatformConnection(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    platform=platform,
                    connection_type=ConnectionType.BROWSER_SESSION,
                    status=ConnectionStatus.CONNECTED,
                    external_account_reference=account_ref,
                    last_verified_at=now,
                )
            else:
                conn.status = ConnectionStatus.CONNECTED
                conn.external_account_reference = account_ref
                conn.last_verified_at = now

            saved_conn = await self._connection_repo.save_connection(conn)

            # Upsert BrowserSession in DB
            sess = await self._session_repo.get_by_connection_id(saved_conn.id)
            if not sess:
                sess = BrowserSession(
                    id=str(uuid.uuid4()),
                    connection_id=saved_conn.id,
                    user_id=user_id,
                    source_id=platform,
                    encrypted_storage_state=encrypted_state,
                    status="ACTIVE",
                    last_used_at=now,
                )
            else:
                sess.source_id = platform
                sess.encrypted_storage_state = encrypted_state
                sess.status = "ACTIVE"
                sess.last_used_at = now

            await self._session_repo.save_session(sess)
            logger.info(f"Successfully connected [{platform}] for user [{user_id}] with encrypted session.")

            return {
                "platform": platform,
                "status": ConnectionStatus.CONNECTED.value,
                "external_account_reference": account_ref,
                "last_verified_at": now.isoformat(),
                "message": f"Successfully connected to {manifest.display_name}!",
            }

        finally:
            await context.close()

    async def verify_connection(self, user_id: str, platform: str) -> ConnectionStatus:
        """Probes live session validity and updates connection status."""
        manifest = PlatformManifestRegistry.get(platform)
        if not manifest:
            raise EntityNotFoundException(f"Unsupported platform: {platform}")

        conn = await self._connection_repo.get_by_user_and_platform(user_id, platform)
        if not conn:
            return ConnectionStatus.NOT_CONNECTED

        sess = await self._session_repo.get_by_connection_id(conn.id)
        encrypted_state = sess.encrypted_storage_state if sess else None

        new_status = await ConnectionHealthChecker.check_health(platform, encrypted_state)
        now = datetime.now(timezone.utc)

        conn.status = new_status
        if new_status == ConnectionStatus.CONNECTED:
            conn.last_verified_at = now
        await self._connection_repo.save_connection(conn)

        return new_status

    async def disconnect(self, user_id: str, platform: str) -> bool:
        """Revokes session and removes platform connection tokens."""
        conn = await self._connection_repo.get_by_user_and_platform(user_id, platform)
        if not conn:
            return True

        sess = await self._session_repo.get_by_connection_id(conn.id)
        if sess:
            await self._session_repo.delete_session(sess.id)

        conn.status = ConnectionStatus.NOT_CONNECTED
        conn.external_account_reference = None
        conn.last_verified_at = None
        await self._connection_repo.save_connection(conn)
        logger.info(f"Disconnected user [{user_id}] from platform [{platform}].")
        return True
