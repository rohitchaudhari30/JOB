from typing import List, Optional
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.connections.entities import BrowserSession, ConnectionStatus, ConnectionType, PlatformConnection
from app.domain.connections.repositories import BrowserSessionRepository, PlatformConnectionRepository
from app.infrastructure.database.models.models import BrowserSessionModel, PlatformConnectionModel, JobSourceModel


class SqlAlchemyConnectionRepository(PlatformConnectionRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_user_and_platform(self, user_id: str, platform: str) -> Optional[PlatformConnection]:
        stmt = select(PlatformConnectionModel).where(
            PlatformConnectionModel.user_id == user_id,
            PlatformConnectionModel.platform == platform
        )
        res = await self._session.scalar(stmt)
        if not res:
            return None
        return self._to_domain(res)

    async def get_by_platform(self, user_id: str, platform: str) -> Optional[PlatformConnection]:
        return await self.get_by_user_and_platform(user_id, platform)

    async def list_user_connections(self, user_id: str) -> List[PlatformConnection]:
        stmt = select(PlatformConnectionModel).where(PlatformConnectionModel.user_id == user_id)
        res = await self._session.scalars(stmt)
        return [self._to_domain(m) for m in res.all()]

    async def save_connection(self, connection: PlatformConnection) -> PlatformConnection:
        model = await self._session.get(PlatformConnectionModel, connection.id)
        if not model:
            # Also check by user_id and platform
            model = await self._session.scalar(
                select(PlatformConnectionModel).where(
                    PlatformConnectionModel.user_id == connection.user_id,
                    PlatformConnectionModel.platform == connection.platform
                )
            )

        if not model:
            model = PlatformConnectionModel(
                id=connection.id,
                user_id=connection.user_id,
                platform=connection.platform,
                connection_type=connection.connection_type.value if hasattr(connection.connection_type, "value") else str(connection.connection_type),
                status=connection.status.value if hasattr(connection.status, "value") else str(connection.status),
                external_account_reference=connection.external_account_reference,
                last_verified_at=connection.last_verified_at,
            )
            self._session.add(model)
        else:
            model.status = connection.status.value if hasattr(connection.status, "value") else str(connection.status)
            model.connection_type = connection.connection_type.value if hasattr(connection.connection_type, "value") else str(connection.connection_type)
            model.external_account_reference = connection.external_account_reference
            model.last_verified_at = connection.last_verified_at

        await self._session.flush()
        await self._session.refresh(model)
        return self._to_domain(model)

    async def delete_connection(self, connection_id: str) -> bool:
        stmt = delete(PlatformConnectionModel).where(PlatformConnectionModel.id == connection_id)
        res = await self._session.execute(stmt)
        await self._session.flush()
        return res.rowcount > 0

    def _to_domain(self, m: PlatformConnectionModel) -> PlatformConnection:
        return PlatformConnection(
            id=m.id,
            user_id=m.user_id,
            platform=m.platform,
            connection_type=ConnectionType(m.connection_type) if m.connection_type in ConnectionType.__members__.values() else ConnectionType.BROWSER_SESSION,
            status=ConnectionStatus(m.status) if m.status in ConnectionStatus.__members__.values() else ConnectionStatus.NOT_CONNECTED,
            external_account_reference=m.external_account_reference,
            last_verified_at=m.last_verified_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )


class SqlAlchemyBrowserSessionRepository(BrowserSessionRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    async def get_by_connection_id(self, connection_id: str) -> Optional[BrowserSession]:
        stmt = select(BrowserSessionModel).where(BrowserSessionModel.connection_id == connection_id)
        res = await self._session.scalar(stmt)
        if not res:
            return None
        return self._to_domain(res)

    async def get_by_user_and_platform(self, user_id: str, platform: str) -> Optional[BrowserSession]:
        plat_lower = platform.lower().strip()
        # 1. Join through PlatformConnectionModel
        stmt = select(BrowserSessionModel).join(
            PlatformConnectionModel, BrowserSessionModel.connection_id == PlatformConnectionModel.id
        ).where(
            BrowserSessionModel.user_id == user_id,
            PlatformConnectionModel.platform.ilike(plat_lower)
        ).order_by(BrowserSessionModel.updated_at.desc())
        res = await self._session.scalar(stmt)
        if res:
            return self._to_domain(res)

        # 2. Match via source_id directly matching platform name
        stmt2 = select(BrowserSessionModel).where(
            BrowserSessionModel.user_id == user_id,
            BrowserSessionModel.source_id.ilike(plat_lower)
        ).order_by(BrowserSessionModel.updated_at.desc())
        res2 = await self._session.scalar(stmt2)
        if res2:
            return self._to_domain(res2)

        # 3. Join through JobSourceModel
        stmt3 = select(BrowserSessionModel).join(
            JobSourceModel, BrowserSessionModel.source_id == JobSourceModel.id
        ).where(
            BrowserSessionModel.user_id == user_id,
            JobSourceModel.source_type.ilike(plat_lower)
        ).order_by(BrowserSessionModel.updated_at.desc())
        res3 = await self._session.scalar(stmt3)
        if res3:
            return self._to_domain(res3)

        return None

    async def save_session(self, session: BrowserSession) -> BrowserSession:
        model = await self._session.get(BrowserSessionModel, session.id)
        if not model and session.connection_id:
            model = await self._session.scalar(
                select(BrowserSessionModel).where(BrowserSessionModel.connection_id == session.connection_id)
            )

        if not model:
            # Resolve source_id from session.source_id or platform_connection
            resolved_source_id = session.source_id
            target_platform = None
            if session.connection_id:
                pc = await self._session.get(PlatformConnectionModel, session.connection_id)
                if pc:
                    target_platform = pc.platform
            if not target_platform and resolved_source_id:
                target_platform = resolved_source_id

            if target_platform:
                js = await self._session.scalar(
                    select(JobSourceModel).where(JobSourceModel.source_type == target_platform)
                )
                if js:
                    resolved_source_id = js.id
                elif not resolved_source_id:
                    resolved_source_id = target_platform

            model = BrowserSessionModel(
                id=session.id,
                connection_id=session.connection_id,
                user_id=session.user_id,
                source_id=resolved_source_id or "default",
                encrypted_storage_state=session.encrypted_storage_state,
                status=session.status,
                expires_at=session.expires_at,
                last_used_at=session.last_used_at,
            )
            self._session.add(model)
        else:
            model.encrypted_storage_state = session.encrypted_storage_state
            model.status = session.status
            model.expires_at = session.expires_at
            model.last_used_at = session.last_used_at
            if session.connection_id:
                model.connection_id = session.connection_id
            if session.source_id:
                model.source_id = session.source_id

        await self._session.flush()
        await self._session.refresh(model)
        return self._to_domain(model)

    async def delete_session(self, session_id: str) -> bool:
        stmt = delete(BrowserSessionModel).where(BrowserSessionModel.id == session_id)
        res = await self._session.execute(stmt)
        await self._session.flush()
        return res.rowcount > 0

    def _to_domain(self, m: BrowserSessionModel) -> BrowserSession:
        return BrowserSession(
            id=m.id,
            connection_id=m.connection_id or "",
            user_id=m.user_id,
            source_id=m.source_id,
            encrypted_storage_state=m.encrypted_storage_state,
            status=m.status,
            expires_at=m.expires_at,
            last_used_at=m.last_used_at,
            created_at=m.created_at,
            updated_at=m.updated_at,
        )
