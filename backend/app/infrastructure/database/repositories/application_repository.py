from typing import List
from sqlalchemy import func, select, and_
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
    MatchResultModel,
)


class SqlAlchemyApplicationRepository(ApplicationRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: ApplicationModel, match_score: float | None = None) -> Application:
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
        job = getattr(model, "job", None)
        job_title = job.title if job else None
        company = job.company if job else None
        location = job.location if job else None
        min_experience_years = job.min_experience_years if job else None
        max_experience_years = job.max_experience_years if job else None
        min_salary = job.min_salary if job else None
        max_salary = job.max_salary if job else None
        salary_currency = job.salary_currency if job else "INR"
        apply_url = job.apply_url if job else None
        platform = None
        if job:
            if getattr(job, "source_id", None) and "-" not in str(job.source_id):
                platform = str(job.source_id).capitalize()
            elif job.apply_url:
                url_lower = job.apply_url.lower()
                if "naukri" in url_lower:
                    platform = "Naukri"
                elif "linkedin" in url_lower:
                    platform = "LinkedIn"
                elif "indeed" in url_lower:
                    platform = "Indeed"
            if not platform:
                platform = "Naukri"
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
            job_title=job_title,
            company=company,
            location=location,
            min_experience_years=min_experience_years,
            max_experience_years=max_experience_years,
            min_salary=min_salary,
            max_salary=max_salary,
            salary_currency=salary_currency,
            apply_url=apply_url,
            platform=platform,
            match_score=match_score,
            questions=questions,
        )

    async def get_by_id(self, application_id: str) -> Application | None:
        stmt = (
            select(ApplicationModel, MatchResultModel.overall_score)
            .outerjoin(
                MatchResultModel,
                and_(
                    MatchResultModel.job_id == ApplicationModel.job_id,
                    MatchResultModel.user_id == ApplicationModel.user_id,
                ),
            )
            .where(ApplicationModel.id == application_id)
            .options(
                selectinload(ApplicationModel.questions),
                selectinload(ApplicationModel.job),
            )
        )
        result = await self._session.execute(stmt)
        row = result.first()
        return self._to_entity(row[0], match_score=row[1]) if row else None

    async def get_by_user_and_job(self, user_id: str, job_id: str) -> Application | None:
        stmt = (
            select(ApplicationModel, MatchResultModel.overall_score)
            .outerjoin(
                MatchResultModel,
                and_(
                    MatchResultModel.job_id == ApplicationModel.job_id,
                    MatchResultModel.user_id == ApplicationModel.user_id,
                ),
            )
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.job_id == job_id,
            )
            .options(
                selectinload(ApplicationModel.questions),
                selectinload(ApplicationModel.job),
            )
        )
        result = await self._session.execute(stmt)
        row = result.first()
        return self._to_entity(row[0], match_score=row[1]) if row else None

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
            select(ApplicationModel, MatchResultModel.overall_score)
            .outerjoin(
                MatchResultModel,
                and_(
                    MatchResultModel.job_id == ApplicationModel.job_id,
                    MatchResultModel.user_id == ApplicationModel.user_id,
                ),
            )
            .where(ApplicationModel.user_id == user_id)
            .options(
                selectinload(ApplicationModel.questions),
                selectinload(ApplicationModel.job),
            )
        )
        if state:
            stmt = stmt.where(ApplicationModel.workflow_state == state)

        stmt = stmt.order_by(ApplicationModel.created_at.desc()).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        rows = result.all()
        return [self._to_entity(m, match_score=score) for m, score in rows]

    async def count_by_state(self, user_id: str, state: str) -> int:
        stmt = select(func.count(ApplicationModel.id)).where(
            ApplicationModel.user_id == user_id,
            ApplicationModel.workflow_state == state,
        )
        result = await self._session.execute(stmt)
        return result.scalar() or 0
