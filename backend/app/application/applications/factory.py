"""One place that builds the apply use case (AUT-13), for web requests and background runs alike."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.applications.use_cases import ExecuteApplicationUseCase
from app.infrastructure.ai.gateway import MultiTierAIGateway
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
from app.infrastructure.database.repositories.connection_repository import SqlAlchemyBrowserSessionRepository
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemyResumeRepository,
)
from app.infrastructure.database.repositories.user_repository import SqlAlchemyUserRepository


def build_execute_application_use_case(session: AsyncSession, commit_each_write: bool = False) -> ExecuteApplicationUseCase:
    """commit_each_write=True is for background runs, where nobody commits at the end of a request."""
    return ExecuteApplicationUseCase(
        app_repo=SqlAlchemyApplicationRepository(session, commit_each_write=commit_each_write),
        job_repo=SqlAlchemyJobRepository(session),
        profile_repo=SqlAlchemyProfileRepository(session),
        resume_repo=SqlAlchemyResumeRepository(session),
        user_repo=SqlAlchemyUserRepository(session),
        session_repo=SqlAlchemyBrowserSessionRepository(session),
        ai_provider=MultiTierAIGateway(session=session),
    )
