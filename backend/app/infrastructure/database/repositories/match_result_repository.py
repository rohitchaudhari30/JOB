import logging
from typing import List, Optional
import uuid
from sqlalchemy import func, select, or_, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.matching.entities import (
    MatchBreakdown,
    MatchResult,
    RecommendationDecision,
)
from app.domain.matching.repositories import MatchResultRepository
from app.infrastructure.database.models.models import MatchResultModel

logger = logging.getLogger("app.infrastructure.match_result_repository")


def is_unique_constraint_violation(err: IntegrityError) -> bool:
    orig = getattr(err, "orig", None)
    if orig is not None:
        sqlite_name = getattr(orig, "sqlite_errorname", "")
        if sqlite_name == "SQLITE_CONSTRAINT_UNIQUE":
            return True
        if getattr(orig, "sqlite_errorcode", 0) == 2067:
            return True
        pgcode = getattr(orig, "pgcode", "") or getattr(orig, "sqlstate", "")
        if pgcode == "23505":
            return True
        if type(orig).__name__ in ("UniqueViolationError", "IntegrityConstraintViolationError"):
            if "unique" in str(orig).lower():
                return True
    err_str = str(err).lower()
    return "unique constraint" in err_str or "duplicate key" in err_str or "sqlite_constraint_unique" in err_str


class SqlAlchemyMatchResultRepository(MatchResultRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: MatchResultModel) -> MatchResult:
        job = None
        insp = inspect(model)
        if insp and "job" not in insp.unloaded:
            job = getattr(model, "job", None)

        breakdown = MatchBreakdown(
            skill_score=getattr(model, "skill_match_score", 0.0) or 0.0,
            experience_score=getattr(model, "experience_score", 0.0) or 0.0,
            role_title_score=getattr(model, "role_title_score", 0.0) or 0.0,
            location_score=getattr(model, "location_score", 0.0) or 0.0,
            salary_score=getattr(model, "salary_score", 0.0) or 0.0,
            semantic_score=getattr(model, "semantic_score", 0.0) or 0.0,
            freshness_score=getattr(model, "freshness_score", 0.0) or 0.0,
            ai_score=getattr(model, "ai_score", 0.0) or 0.0,
        )

        match_score_val = getattr(model, "match_score", None)
        overall_score_val = getattr(model, "overall_score", 0.0) or 0.0
        if match_score_val is None or match_score_val == 0.0:
            match_score_val = overall_score_val

        decision_val = getattr(model, "decision", "REQUIRE_APPROVAL") or "REQUIRE_APPROVAL"
        try:
            rec_decision = RecommendationDecision(decision_val)
        except Exception:
            rec_decision = RecommendationDecision.REQUIRE_APPROVAL

        return MatchResult(
            id=model.id,
            user_id=model.user_id,
            job_id=model.job_id,
            resume_id=model.resume_id,
            evaluation_key=getattr(model, "evaluation_key", "") or "",
            match_score=match_score_val,
            recommendation_score=getattr(model, "recommendation_score", None),
            overall_score=overall_score_val,
            breakdown=breakdown,
            hard_filter_passed=model.hard_filter_passed,
            skill_match_score=model.skill_match_score or 0.0,
            experience_score=getattr(model, "experience_score", 0.0) or 0.0,
            role_title_score=getattr(model, "role_title_score", 0.0) or 0.0,
            location_score=getattr(model, "location_score", 0.0) or 0.0,
            salary_score=getattr(model, "salary_score", 0.0) or 0.0,
            semantic_score=model.semantic_score or 0.0,
            freshness_score=getattr(model, "freshness_score", 0.0) or 0.0,
            ai_score=getattr(model, "ai_score", 0.0) or 0.0,
            resume_version=getattr(model, "resume_version", 1) or 1,
            resume_snapshot_hash=getattr(model, "resume_snapshot_hash", "") or "",
            profile_version=getattr(model, "profile_version", 1) or 1,
            profile_snapshot_hash=getattr(model, "profile_snapshot_hash", "") or "",
            job_snapshot_hash=getattr(model, "job_snapshot_hash", "") or "",
            matching_engine_version=getattr(model, "matching_engine_version", "4.0.0") or "4.0.0",
            matching_config_version=getattr(model, "matching_config_version", "v1") or "v1",
            prompt_version=getattr(model, "prompt_version", "match-v2") or "match-v2",
            embedding_model=getattr(model, "embedding_model", "all-MiniLM-L6-v2") or "all-MiniLM-L6-v2",
            embedding_version=getattr(model, "embedding_version", "2026.1") or "2026.1",
            reasoning_summary=model.reasoning_summary or "",
            matched_skills=model.matched_skills or [],
            missing_skills=model.missing_skills or [],
            decision=rec_decision,
            recommendation_reasons=getattr(model, "recommendation_reasons", []) or [],
            blocking_reasons=getattr(model, "blocking_reasons", []) or [],
            ai_provider_used=model.ai_provider_used or "groq",
            ai_model=getattr(model, "ai_model", None),
            duration_ms=getattr(model, "duration_ms", 0) or 0,
            created_at=model.created_at,
            job_title=job.title if job else None,
            company=job.company if job else None,
            location=job.location if job else None,
            apply_url=job.apply_url if job else None,
            raw_posted_text=job.raw_posted_text if job else None,
            min_experience_years=getattr(job, "min_experience_years", None) if job else None,
            max_experience_years=getattr(job, "max_experience_years", None) if job else None,
        )

    async def get_by_user_and_job(self, user_id: str, job_id: str) -> MatchResult | None:
        stmt = (
            select(MatchResultModel)
            .where(
                MatchResultModel.user_id == user_id,
                MatchResultModel.job_id == job_id,
            )
            .order_by(MatchResultModel.created_at.desc())
            .options(selectinload(MatchResultModel.job))
            .limit(1)
        )
        result = await self._session.execute(stmt)
        model = result.scalars().first()
        return self._to_entity(model) if model else None

    async def get_by_evaluation_key(self, user_id: str, job_id: str, evaluation_key: str) -> MatchResult | None:
        stmt = (
            select(MatchResultModel)
            .where(
                MatchResultModel.user_id == user_id,
                MatchResultModel.job_id == job_id,
                MatchResultModel.evaluation_key == evaluation_key,
            )
            .options(selectinload(MatchResultModel.job))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def save(self, match: MatchResult) -> MatchResult:
        eval_key = match.evaluation_key or f"eval_{match.user_id}_{match.job_id}"
        stmt = (
            select(MatchResultModel)
            .where(
                MatchResultModel.user_id == match.user_id,
                MatchResultModel.job_id == match.job_id,
                MatchResultModel.evaluation_key == eval_key,
            )
            .options(selectinload(MatchResultModel.job))
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        match_score_val = match.match_score if match.match_score > 0.0 else match.overall_score
        overall_score_val = match_score_val
        breakdown_dict = match.breakdown.to_dict() if match.breakdown else {}

        if not model:
            model = MatchResultModel(
                id=match.id if (match.id and len(match.id) <= 36 and not match.id.startswith("match_")) else str(uuid.uuid4()),
                user_id=match.user_id,
                job_id=match.job_id,
                resume_id=match.resume_id,
                evaluation_key=match.evaluation_key or f"eval_{match.user_id}_{match.job_id}",
                match_score=match_score_val,
                recommendation_score=match.recommendation_score,
                overall_score=overall_score_val,
                hard_filter_passed=match.hard_filter_passed,
                skill_match_score=match.skill_match_score,
                experience_score=match.experience_score,
                role_title_score=match.role_title_score,
                location_score=match.location_score,
                salary_score=match.salary_score,
                semantic_score=match.semantic_score,
                freshness_score=match.freshness_score,
                ai_score=match.ai_score,
                resume_version=match.resume_version,
                resume_snapshot_hash=match.resume_snapshot_hash,
                profile_version=match.profile_version,
                profile_snapshot_hash=match.profile_snapshot_hash,
                job_snapshot_hash=match.job_snapshot_hash,
                matching_engine_version=match.matching_engine_version,
                matching_config_version=match.matching_config_version,
                prompt_version=match.prompt_version,
                embedding_model=match.embedding_model or "all-MiniLM-L6-v2",
                embedding_version=match.embedding_version or "2026.1",
                reasoning_summary=match.reasoning_summary,
                matched_skills=match.matched_skills,
                missing_skills=match.missing_skills,
                decision=match.decision.value if hasattr(match.decision, "value") else str(match.decision),
                recommendation_reasons=match.recommendation_reasons,
                blocking_reasons=match.blocking_reasons,
                breakdown_json=breakdown_dict,
                ai_provider_used=match.ai_provider_used,
                ai_model=match.ai_model,
                duration_ms=match.duration_ms,
            )
            self._session.add(model)
        else:
            model.match_score = match_score_val
            model.recommendation_score = match.recommendation_score
            model.overall_score = overall_score_val
            model.hard_filter_passed = match.hard_filter_passed
            model.skill_match_score = match.skill_match_score
            model.experience_score = match.experience_score
            model.role_title_score = match.role_title_score
            model.location_score = match.location_score
            model.salary_score = match.salary_score
            model.semantic_score = match.semantic_score
            model.freshness_score = match.freshness_score
            model.ai_score = match.ai_score
            model.resume_version = match.resume_version
            model.resume_snapshot_hash = match.resume_snapshot_hash
            model.profile_version = match.profile_version
            model.profile_snapshot_hash = match.profile_snapshot_hash
            model.job_snapshot_hash = match.job_snapshot_hash
            model.matching_engine_version = match.matching_engine_version
            model.matching_config_version = match.matching_config_version
            model.prompt_version = match.prompt_version
            model.embedding_model = match.embedding_model or "all-MiniLM-L6-v2"
            model.embedding_version = match.embedding_version or "2026.1"
            model.reasoning_summary = match.reasoning_summary
            model.matched_skills = match.matched_skills
            model.missing_skills = match.missing_skills
            model.decision = match.decision.value if hasattr(match.decision, "value") else str(match.decision)
            model.recommendation_reasons = match.recommendation_reasons
            model.blocking_reasons = match.blocking_reasons
            model.breakdown_json = breakdown_dict
            model.ai_provider_used = match.ai_provider_used
            model.ai_model = match.ai_model
            model.duration_ms = match.duration_ms

        try:
            await self._session.flush()
        except IntegrityError as err:
            if not is_unique_constraint_violation(err):
                raise

            logger.info(
                f"Concurrent evaluation race detected for user {match.user_id} and job {match.job_id}. "
                "Rolling back failed transaction and returning canonical persisted match."
            )
            await self._session.rollback()

            stmt_reload = (
                select(MatchResultModel)
                .where(
                    MatchResultModel.user_id == match.user_id,
                    MatchResultModel.job_id == match.job_id,
                    MatchResultModel.evaluation_key == eval_key,
                )
                .options(selectinload(MatchResultModel.job))
            )
            result_reload = await self._session.execute(stmt_reload)
            existing_model = result_reload.scalar_one_or_none()
            if existing_model:
                entity = self._to_entity(existing_model)
                if not entity.job_title and match.job_title:
                    entity.job_title = match.job_title
                    entity.company = match.company
                    entity.location = match.location
                    entity.apply_url = match.apply_url
                    entity.raw_posted_text = match.raw_posted_text
                    entity.min_experience_years = match.min_experience_years
                    entity.max_experience_years = match.max_experience_years
                return entity
            raise

        entity = self._to_entity(model)
        if not entity.job_title and match.job_title:
            entity.job_title = match.job_title
            entity.company = match.company
            entity.location = match.location
            entity.apply_url = match.apply_url
            entity.raw_posted_text = match.raw_posted_text
            entity.min_experience_years = match.min_experience_years
            entity.max_experience_years = match.max_experience_years
        return entity

    @staticmethod
    def _filters(user_id: str, min_score: float | None, decision: str | None) -> list:
        conds = [MatchResultModel.user_id == user_id]
        if min_score is not None:
            conds.append(
                or_(MatchResultModel.match_score >= min_score, MatchResultModel.overall_score >= min_score)
            )
        if decision:
            conds.append(MatchResultModel.decision == decision)
        return conds

    async def list_by_user(
        self,
        user_id: str,
        min_score: float | None = None,
        decision: str | None = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[MatchResult]:
        stmt = (
            select(MatchResultModel)
            .where(*self._filters(user_id, min_score, decision))
            .options(selectinload(MatchResultModel.job))
            .order_by(MatchResultModel.match_score.desc(), MatchResultModel.id)
            .offset(skip)
            .limit(limit)
        )
        result = await self._session.execute(stmt)
        return [self._to_entity(m) for m in result.scalars().all()]

    async def count_by_user(self, user_id: str, min_score: float | None = None, decision: str | None = None) -> int:
        stmt = select(func.count()).select_from(MatchResultModel).where(*self._filters(user_id, min_score, decision))
        return int((await self._session.execute(stmt)).scalar_one())
