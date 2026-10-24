"""Builds the tailoring service from a database session (used by the API and by the worker)."""
from typing import Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.resume_tailoring.deps import TailoringDeps
from app.application.resume_tailoring.service import TailoringService
from app.core.config import settings
from app.infrastructure.ai.gateway import MultiTierAIGateway
from app.infrastructure.ai.tailoring_ai import GatewayTailoringAI
from app.infrastructure.database.repositories.connection_repository import SqlAlchemyBrowserSessionRepository
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
from app.infrastructure.database.repositories.profile_repository import SqlAlchemyProfileRepository, SqlAlchemyResumeRepository
from app.infrastructure.database.repositories.tailored_resume_repository import (
    SqlAlchemyConfirmedFactRepository,
    SqlAlchemyTailoredResumeRepository,
)
from app.infrastructure.documents.toolkit import FileDocumentToolkit


def build_tailoring_deps(session: AsyncSession, on_work_queued: Optional[Callable[[], None]] = None) -> TailoringDeps:
    return TailoringDeps(
        tailored=SqlAlchemyTailoredResumeRepository(session),
        facts=SqlAlchemyConfirmedFactRepository(session),
        resumes=SqlAlchemyResumeRepository(session),
        jobs=SqlAlchemyJobRepository(session),
        toolkit=FileDocumentToolkit(),
        ai=GatewayTailoringAI(MultiTierAIGateway(session=session)),
        storage_root=settings.STORAGE_DIR,
        on_work_queued=on_work_queued,
        sessions=SqlAlchemyBrowserSessionRepository(session),
        profiles=SqlAlchemyProfileRepository(session),
    )


def build_tailoring_service(session: AsyncSession, on_work_queued: Optional[Callable[[], None]] = None) -> TailoringService:
    return TailoringService(build_tailoring_deps(session, on_work_queued))
