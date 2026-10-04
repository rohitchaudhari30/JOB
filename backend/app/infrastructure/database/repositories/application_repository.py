from typing import List
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.domain.applications.entities import (
    Application,
    ApplicationEvent,
    ApplicationQuestion,
    WorkflowStateEnum,
)
from app.domain.applications.repositories import ApplicationRepository
from app.infrastructure.database.models.models import (
    ApplicationEventModel,
    ApplicationModel,
    ApplicationQuestionModel,
)


class SqlAlchemyApplicationRepository(ApplicationRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: ApplicationModel) -> Application:
        questions = [
            ApplicationQuestion(
                id=q.id,
                application_id=q.application_id,
                question_text=q.question_text,
                canonical_intent=q.canonical_intent,
                answer_provided=q.answer_provided,
                answered_by=q.answered_by,
                confidence_score=q.confidence_score,
            )
            for q in (model.questions or [])
        ]
        return Application(
            id=model.id,
            user_id=model.user_id,
            job_id=model.job_id,
            resume_id=model.resume_id,
            idempotency_key=model.idempotency_key,
            workflow_state=WorkflowStateEnum(model.workflow_state),
            applied_at=model.applied_at,
            failure_reason=model.failure_reason,
            trace_file_path=model.trace_file_path,
            screenshot_file_path=model.screenshot_file_path,
            created_at=model.created_at,
            updated_at=model.updated_at,
            questions=questions,
        )

    async def get_by_id(self, application_id: str) -> Application | None:
        stmt = (
            select(ApplicationModel)
            .where(ApplicationModel.id == application_id)
            .options(selectinload(ApplicationModel.questions))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def get_by_user_and_job(self, user_id: str, job_id: str) -> Application | None:
        stmt = (
            select(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.job_id == job_id,
            )
            .options(selectinload(ApplicationModel.questions))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def save(self, application: Application) -> Application:
        stmt = select(ApplicationModel).where(ApplicationModel.id == application.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            model = ApplicationModel(
                id=application.id,
                user_id=application.user_id,
                job_id=application.job_id,
                resume_id=application.resume_id,
                idempotency_key=application.idempotency_key,
                workflow_state=application.workflow_state.value,
                applied_at=application.applied_at,
                failure_reason=application.failure_reason,
                trace_file_path=application.trace_file_path,
                screenshot_file_path=application.screenshot_file_path,
            )
            self._session.add(model)
        else:
            model.workflow_state = application.workflow_state.value
            model.applied_at = application.applied_at
            model.failure_reason = application.failure_reason
            model.trace_file_path = application.trace_file_path
            model.screenshot_file_path = application.screenshot_file_path

        await self._session.flush()
        return await self.get_by_id(application.id)  # type: ignore

    async def add_event(self, event: ApplicationEvent) -> ApplicationEvent:
        model = ApplicationEventModel(
            id=event.id,
            application_id=event.application_id,
            event_name=event.event_name,
            payload=event.payload,
        )
        self._session.add(model)
        await self._session.flush()
        return event

    async def add_question(self, question: ApplicationQuestion) -> ApplicationQuestion:
        model = ApplicationQuestionModel(
            id=question.id,
            application_id=question.application_id,
            question_text=question.question_text,
            canonical_intent=question.canonical_intent,
            answer_provided=question.answer_provided,
            answered_by=question.answered_by,
            confidence_score=question.confidence_score,
        )
        self._session.add(model)
        await self._session.flush()
        return question

    async def list_by_user(
        self,
        user_id: str,
        state: str | None = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Application]:
        stmt = (
            select(ApplicationModel)
            .where(ApplicationModel.user_id == user_id)
            .options(selectinload(ApplicationModel.questions))
        )
        if state:
            stmt = stmt.where(ApplicationModel.workflow_state == state)

        stmt = stmt.order_by(ApplicationModel.created_at.desc()).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def count_by_state(self, user_id: str, state: str) -> int:
        stmt = select(func.count(ApplicationModel.id)).where(
            ApplicationModel.user_id == user_id,
            ApplicationModel.workflow_state == state,
        )
        result = await self._session.execute(stmt)
        return result.scalar() or 0
