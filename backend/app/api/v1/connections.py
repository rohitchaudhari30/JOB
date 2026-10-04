from typing import Annotated, Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.deps import get_connection_manager, get_current_user
from app.domain.auth.entities import User
from app.infrastructure.connections.connection_manager import ConnectionManager

router = APIRouter(prefix="/connections", tags=["Platform Connections"])


class PlatformStatusResponse(BaseModel):
    platform: str
    display_name: str
    category: str
    connection_type: str
    is_auth_required: bool
    status: str
    session_active: bool
    external_account_reference: str | None = None
    last_verified_at: str | None = None
    capabilities: List[str]
    description: str


class ConnectActionResponse(BaseModel):
    platform: str
    status: str
    external_account_reference: str | None = None
    last_verified_at: str | None = None
    message: str


@router.get("", response_model=List[PlatformStatusResponse])
async def list_connections(
    current_user: Annotated[User, Depends(get_current_user)],
    conn_manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
):
    """List all available job discovery portals and ATS systems with connection status and capabilities."""
    return await conn_manager.list_connections(current_user.id)


@router.post("/{platform}/connect", response_model=ConnectActionResponse)
async def connect_platform(
    platform: str,
    current_user: Annotated[User, Depends(get_current_user)],
    conn_manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
):
    """
    Initiates interactive browser login session.
    A headed browser window is presented for the user to authenticate on the target portal.
    Tokens are extracted and stored with AES-256-GCM encryption.
    """
    result = await conn_manager.initiate_interactive_connect(current_user.id, platform)
    return result


@router.post("/{platform}/verify")
async def verify_platform_connection(
    platform: str,
    current_user: Annotated[User, Depends(get_current_user)],
    conn_manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
):
    """Probes live session validity and returns updated health status."""
    is_valid = await conn_manager.verify_connection(current_user.id, platform)
    return {
        "platform": platform,
        "is_valid": is_valid,
        "status": "CONNECTED" if is_valid else "REAUTH_REQUIRED",
    }


@router.post("/{platform}/disconnect")
async def disconnect_platform(
    platform: str,
    current_user: Annotated[User, Depends(get_current_user)],
    conn_manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
):
    """Revokes session and removes platform credentials securely."""
    await conn_manager.disconnect(current_user.id, platform)
    return {
        "platform": platform,
        "status": "NOT_CONNECTED",
        "message": f"Successfully disconnected from {platform}.",
    }
