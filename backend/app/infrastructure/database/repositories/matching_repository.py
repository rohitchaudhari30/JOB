from typing import List
from sqlalchemy import select, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.domain.matching.entities import DecisionEnum, MatchResult
from app.domain.matching.repositories import MatchResultRepository
from app.infrastructure.database.models.models import MatchResultModel


class SqlAlchemyMatchResultRepository(MatchResultRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: MatchResultModel) -> MatchResult:
        job = None
        insp = inspect(model)
        if insp and "job" not in insp.unloaded:
            job = getattr(model, "job", None)

        return MatchResult(
            id=model.id,
            user_id=model.user_id,
            job_id=model.job_id,
            resume_id=model.resume_id,
            overall_score=model.overall_score,
            hard_filter_passed=model.hard_filter_passed,
            skill_match_score=model.skill_match_score,
            semantic_score=model.semantic_score,
            reasoning_summary=model.reasoning_summary,
            matched_skills=model.matched_skills or [],
            missing_skills=model.missing_skills or [],
            decision=DecisionEnum(model.decision),
            ai_provider_used=model.ai_provider_used,
            scoring_version=model.scoring_version,
            created_at=model.created_at,
            job_title=job.title if job else None,
            company=job.company if job else None,
            location=job.location if job else None,
            apply_url=job.apply_url if job else None,
            raw_posted_text=job.raw_posted_text if job else None,
        )

    async def get_by_user_and_job(self, user_id: str, job_id: str) -> MatchResult | None:
        stmt = (
            select(MatchResultModel)
            .where(
                MatchResultModel.user_id == user_id,
                MatchResultModel.job_id == job_id,
            )
            .options(selectinload(MatchResultModel.job))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def save(self, match: MatchResult) -> MatchResult:
        stmt = (
            select(MatchResultModel)
            .where(
                MatchResultModel.user_id == match.user_id,
                MatchResultModel.job_id == match.job_id,
            )
            .options(selectinload(MatchResultModel.job))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            model = MatchResultModel(
                id=match.id,
                user_id=match.user_id,
                job_id=match.job_id,
                resume_id=match.resume_id,
                overall_score=match.overall_score,
                hard_filter_passed=match.hard_filter_passed,
                skill_match_score=match.skill_match_score,
                semantic_score=match.semantic_score,
                reasoning_summary=match.reasoning_summary,
                matched_skills=match.matched_skills,
                missing_skills=match.missing_skills,
                decision=match.decision.value,
                ai_provider_used=match.ai_provider_used,
                scoring_version=match.scoring_version,
            )
            self._session.add(model)
        else:
            model.overall_score = match.overall_score
            model.hard_filter_passed = match.hard_filter_passed
            model.skill_match_score = match.skill_match_score
            model.semantic_score = match.semantic_score
            model.reasoning_summary = match.reasoning_summary
            model.matched_skills = match.matched_skills
            model.missing_skills = match.missing_skills
            model.decision = match.decision.value
            model.ai_provider_used = match.ai_provider_used

        await self._session.flush()
        saved = await self.get_by_user_and_job(match.user_id, match.job_id)
        if saved:
            return saved
        return self._to_entity(model)

    async def list_by_user(
        self,
        user_id: str,
        min_score: float | None = None,
        decision: str | None = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[MatchResult]:
        stmt = (
            select(MatchResultModel)
            .where(MatchResultModel.user_id == user_id)
            .options(selectinload(MatchResultModel.job))
        )
        if min_score is not None:
            stmt = stmt.where(MatchResultModel.overall_score >= min_score)
        if decision:
            stmt = stmt.where(MatchResultModel.decision == decision)

        stmt = stmt.order_by(MatchResultModel.overall_score.desc()).offset(skip).limit(limit)
        result = await self._session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]
