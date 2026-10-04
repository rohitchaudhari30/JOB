from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from app.domain.connections.entities import (
    BrowserSession,
    ConnectionStatus,
    PlatformCapability,
    PlatformConnection,
    PlatformManifest,
)


class PlatformRegistryInterface(ABC):
    @abstractmethod
    def list_manifests(self) -> List[PlatformManifest]:
        """List all supported platforms and their capabilities."""
        pass

    @abstractmethod
    def get_manifest(self, platform_id: str) -> Optional[PlatformManifest]:
        """Get manifest for a specific platform."""
        pass


class ConnectionManagerInterface(ABC):
    @abstractmethod
    async def get_connection_status(self, user_id: str, platform: str) -> PlatformConnection:
        """Get full connection status and session health for a platform."""
        pass

    @abstractmethod
    async def list_connections(self, user_id: str) -> List[Dict]:
        """List all available platforms along with user connection state and capabilities."""
        pass

    @abstractmethod
    async def initiate_interactive_connect(self, user_id: str, platform: str) -> Dict:
        """Launch interactive headed browser session for human login, then extract encrypted storage_state."""
        pass

    @abstractmethod
    async def verify_connection(self, user_id: str, platform: str) -> bool:
        """Probe platform session validity and update connection status."""
        pass

    @abstractmethod
    async def disconnect(self, user_id: str, platform: str) -> bool:
        """Disconnect platform and securely delete session tokens."""
        pass
