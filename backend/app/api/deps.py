from typing import Annotated
from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db_session
from app.core.exceptions import AuthenticationException
from app.core.security import decode_access_token
from app.domain.ai.contracts import AIGateway
from app.domain.auth.entities import User
from app.domain.auth.repositories import UserRepository
from app.infrastructure.ai.gateway import MultiTierAIGateway
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository, SqlAlchemyJobSourceRepository
from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchResultRepository
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemyResumeRepository,
    SqlAlchemySavedAnswerRepository,
)
from app.infrastructure.database.repositories.user_repository import SqlAlchemyUserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


async def get_user_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> UserRepository:
    return SqlAlchemyUserRepository(session)


async def get_profile_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemyProfileRepository:
    return SqlAlchemyProfileRepository(session)


async def get_resume_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemyResumeRepository:
    return SqlAlchemyResumeRepository(session)


async def get_saved_answer_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemySavedAnswerRepository:
    return SqlAlchemySavedAnswerRepository(session)


async def get_job_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemyJobRepository:
    return SqlAlchemyJobRepository(session)


async def get_job_source_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemyJobSourceRepository:
    return SqlAlchemyJobSourceRepository(session)


async def get_matching_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemyMatchResultRepository:
    return SqlAlchemyMatchResultRepository(session)


async def get_application_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> SqlAlchemyApplicationRepository:
    return SqlAlchemyApplicationRepository(session)


async def get_connection_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> "SqlAlchemyConnectionRepository":
    from app.infrastructure.database.repositories.connection_repository import SqlAlchemyConnectionRepository
    return SqlAlchemyConnectionRepository(session)


async def get_browser_session_repository(session: Annotated[AsyncSession, Depends(get_db_session)]) -> "SqlAlchemyBrowserSessionRepository":
    from app.infrastructure.database.repositories.connection_repository import SqlAlchemyBrowserSessionRepository
    return SqlAlchemyBrowserSessionRepository(session)


async def get_connection_manager(
    conn_repo: Annotated["SqlAlchemyConnectionRepository", Depends(get_connection_repository)],
    sess_repo: Annotated["SqlAlchemyBrowserSessionRepository", Depends(get_browser_session_repository)],
) -> "ConnectionManager":
    from app.infrastructure.connections.connection_manager import ConnectionManager
    return ConnectionManager(conn_repo, sess_repo)


async def get_campaign_repository(session: Annotated[AsyncSession, Depends(get_db_session)]):
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignRepository
    return SqlAlchemyCampaignRepository(session)


async def get_campaign_execution_repository(session: Annotated[AsyncSession, Depends(get_db_session)]):
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignExecutionRepository
    return SqlAlchemyCampaignExecutionRepository(session)


async def get_campaign_activity_log_repository(session: Annotated[AsyncSession, Depends(get_db_session)]):
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyCampaignActivityLogRepository
    return SqlAlchemyCampaignActivityLogRepository(session)


async def get_quota_reservation_repository(session: Annotated[AsyncSession, Depends(get_db_session)]):
    from app.infrastructure.database.repositories.campaign_repository import SqlAlchemyQuotaReservationRepository
    return SqlAlchemyQuotaReservationRepository(session)


async def get_matching_task_repository(session: Annotated[AsyncSession, Depends(get_db_session)]):
    from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchingTaskRepository
    return SqlAlchemyMatchingTaskRepository(session)


async def get_ai_gateway(session: Annotated[AsyncSession, Depends(get_db_session)]) -> AIGateway:
    return MultiTierAIGateway(session=session)


async def get_current_user(
    token: Annotated[str | None, Depends(oauth2_scheme)],
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> User:
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token is missing.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(token)
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise AuthenticationException("Token missing user subject.")
        from app.infrastructure.database.repositories.revoked_token_repository import (
            SqlAlchemyRevokedTokenRepository,
        )

        if await SqlAlchemyRevokedTokenRepository(session).is_revoked(payload.get("jti")):
            raise AuthenticationException("Token has been revoked.")
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await user_repo.get_by_id(user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Allow only users listed in ADMIN_EMAILS (case-insensitive)."""
    from app.core.config import settings

    admins = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
    if current_user.email.lower() not in admins:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This operation affects data shared by all users and needs an administrator.",
        )
    return current_user
