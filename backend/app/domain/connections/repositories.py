from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.connections.entities import BrowserSession, PlatformConnection


class PlatformConnectionRepository(ABC):
    @abstractmethod
    async def get_by_user_and_platform(self, user_id: str, platform: str) -> Optional[PlatformConnection]:
        """Fetch a user's platform connection."""
        pass

    @abstractmethod
    async def list_user_connections(self, user_id: str) -> List[PlatformConnection]:
        """List all platform connections for a user."""
        pass

    @abstractmethod
    async def save_connection(self, connection: PlatformConnection) -> PlatformConnection:
        """Upsert a platform connection."""
        pass

    @abstractmethod
    async def delete_connection(self, connection_id: str) -> bool:
        """Delete a platform connection."""
        pass


class BrowserSessionRepository(ABC):
    @abstractmethod
    async def get_by_connection_id(self, connection_id: str) -> Optional[BrowserSession]:
        """Fetch active browser session for a connection."""
        pass

    @abstractmethod
    async def get_by_user_and_platform(self, user_id: str, platform: str) -> Optional[BrowserSession]:
        """Fetch active browser session for a user and platform."""
        pass

    @abstractmethod
    async def save_session(self, session: BrowserSession) -> BrowserSession:
        """Upsert a browser session."""
        pass

    @abstractmethod
    async def delete_session(self, session_id: str) -> bool:
        """Delete / revoke a browser session."""
        pass
