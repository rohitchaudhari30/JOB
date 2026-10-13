from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database.models.models import RevokedTokenModel


class SqlAlchemyRevokedTokenRepository:
    """Remembers logged-out / rotated tokens until they would have expired anyway."""

    def __init__(self, session: AsyncSession):
        self._session = session

    async def revoke(self, jti: str | None, expires_at: datetime, user_id: str | None = None) -> None:
        if not jti:
            return  # tokens issued before jti existed cannot be tracked individually
        if await self.is_revoked(jti):
            return
        self._session.add(RevokedTokenModel(jti=jti, user_id=user_id, expires_at=expires_at))
        await self._session.flush()

    async def is_revoked(self, jti: str | None) -> bool:
        if not jti:
            return False
        found = await self._session.scalar(
            select(RevokedTokenModel.jti).where(RevokedTokenModel.jti == jti)
        )
        return found is not None

    async def purge_expired(self) -> int:
        result = await self._session.execute(
            delete(RevokedTokenModel).where(RevokedTokenModel.expires_at < datetime.now(timezone.utc))
        )
        await self._session.flush()
        return result.rowcount or 0
