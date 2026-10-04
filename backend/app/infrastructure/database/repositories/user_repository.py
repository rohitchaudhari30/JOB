from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.auth.entities import User, UserSession
from app.domain.auth.repositories import UserRepository
from app.infrastructure.database.models.models import UserModel, UserSessionModel


class SqlAlchemyUserRepository(UserRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: UserModel) -> User:
        return User(
            id=model.id,
            email=model.email,
            hashed_password=model.hashed_password,
            full_name=model.full_name,
            is_active=model.is_active,
            is_superuser=model.is_superuser,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def get_by_id(self, user_id: str) -> User | None:
        stmt = select(UserModel).where(UserModel.id == user_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def get_by_email(self, email: str) -> User | None:
        stmt = select(UserModel).where(UserModel.email == email.lower().strip())
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def create(self, user: User) -> User:
        model = UserModel(
            id=user.id,
            email=user.email.lower().strip(),
            hashed_password=user.hashed_password,
            full_name=user.full_name,
            is_active=user.is_active,
            is_superuser=user.is_superuser,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return self._to_entity(model)

    async def create_session(self, session_entity: UserSession) -> UserSession:
        model = UserSessionModel(
            id=session_entity.id,
            user_id=session_entity.user_id,
            jwt_token_hash=session_entity.jwt_token_hash,
            user_agent=session_entity.user_agent,
            ip_address=session_entity.ip_address,
            expires_at=session_entity.expires_at,
        )
        self._session.add(model)
        await self._session.flush()
        await self._session.refresh(model)
        return UserSession(
            id=model.id,
            user_id=model.user_id,
            jwt_token_hash=model.jwt_token_hash,
            user_agent=model.user_agent,
            ip_address=model.ip_address,
            expires_at=model.expires_at,
            created_at=model.created_at,
        )

    async def get_session_by_hash(self, token_hash: str) -> UserSession | None:
        stmt = select(UserSessionModel).where(UserSessionModel.jwt_token_hash == token_hash)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if not model:
            return None
        return UserSession(
            id=model.id,
            user_id=model.user_id,
            jwt_token_hash=model.jwt_token_hash,
            user_agent=model.user_agent,
            ip_address=model.ip_address,
            expires_at=model.expires_at,
            created_at=model.created_at,
        )
