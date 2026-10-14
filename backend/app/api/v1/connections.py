from app.domain.connections.entities import ConnectionStatus
from typing import Annotated, Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.deps import get_connection_manager, get_current_user
from app.core.exceptions import EntityNotFoundException, ValidationException
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
    new_status = await conn_manager.verify_connection(current_user.id, platform)
    return {
        "platform": platform,
        "is_valid": new_status == ConnectionStatus.CONNECTED,
        "status": new_status.value,  # e.g. ERROR means the check failed, not that you must log in again
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


class ImportSessionRequest(BaseModel):
    storage_state: Dict[str, Any]


@router.post("/{platform}/import-session")
async def import_platform_session(
    platform: str,
    req: ImportSessionRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    conn_manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
):
    """Connect with a login saved on your own computer (see scripts/export_login_session.py)."""
    try:
        return await conn_manager.import_session(current_user.id, platform, req.storage_state)
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
