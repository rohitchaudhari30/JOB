from datetime import datetime, timezone
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field


class ConnectionStatus(str, Enum):
    NOT_CONNECTED = "NOT_CONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    SESSION_EXPIRED = "SESSION_EXPIRED"
    REAUTH_REQUIRED = "REAUTH_REQUIRED"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"


class ConnectionType(str, Enum):
    BROWSER_SESSION = "BROWSER_SESSION"
    API_TOKEN = "API_TOKEN"
    OAUTH = "OAUTH"
    PUBLIC_ACCESS = "PUBLIC_ACCESS"


class PlatformCapability(str, Enum):
    JOB_SEARCH = "JOB_SEARCH"
    JOB_DETAILS = "JOB_DETAILS"
    APPLICATION = "APPLICATION"
    APPLICATION_STATUS = "APPLICATION_STATUS"
    PROFILE_SYNC = "PROFILE_SYNC"


class PlatformCategory(str, Enum):
    PORTAL_DISCOVERY = "PORTAL_DISCOVERY"  # Type A: Naukri, LinkedIn, Indeed
    ATS_APPLICATION = "ATS_APPLICATION"    # Type B: Greenhouse, Lever, Workday, Ashby


class PlatformManifest(BaseModel):
    """Metadata describing a platform and its capabilities."""
    platform_id: str
    display_name: str
    category: PlatformCategory
    connection_type: ConnectionType
    capabilities: List[PlatformCapability]
    login_url: str
    is_auth_required: bool = True
    description: str = ""


class BrowserSession(BaseModel):
    id: str
    connection_id: str
    user_id: str
    source_id: Optional[str] = None
    encrypted_storage_state: str  # AES-256-GCM ciphertext
    status: str = "ACTIVE"
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PlatformConnection(BaseModel):
    id: str
    user_id: str
    platform: str
    connection_type: ConnectionType = ConnectionType.BROWSER_SESSION
    status: ConnectionStatus = ConnectionStatus.NOT_CONNECTED
    external_account_reference: Optional[str] = None  # e.g. masked email / username
    last_verified_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    session: Optional[BrowserSession] = None
