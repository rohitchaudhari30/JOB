import logging
from typing import Any, Dict, List, Optional
from app.application.matching.cascade import MatchingCascadeEngine
from app.core.exceptions import EntityNotFoundException
from app.domain.ai.contracts import AIGateway
from app.domain.jobs.repositories import JobRepository
from app.domain.matching.entities import MatchResult, MatchRule
from app.domain.matching.repositories import MatchResultRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository

logger = logging.getLogger("app.application.matching")


class EvaluateJobMatchUseCase:
    """Evaluates a single job against candidate profile using the 5-stage matching cascade."""

    def __init__(
        self,
        profile_repo: CandidateProfileRepository,
        job_repo: JobRepository,
        match_repo: MatchResultRepository,
        resume_repo: ResumeRepository,
        ai_gateway: AIGateway,
    ):
        self._profile_repo = profile_repo
        self._job_repo = job_repo
        self._match_repo = match_repo
        self._resume_repo = resume_repo
        self._cascade = MatchingCascadeEngine(ai_gateway=ai_gateway)

    async def execute(
        self,
        user_id: str,
        job_id: str,
        resume_id: Optional[str] = None,
        custom_rule: Optional[MatchRule] = None,
    ) -> MatchResult:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            raise EntityNotFoundException("CandidateProfile", user_id)

        job = await self._job_repo.get_by_id(job_id)
        if not job:
            raise EntityNotFoundException("Job", job_id)

        resume = None
        if resume_id:
            resume = await self._resume_repo.get_by_id(resume_id)

        # Run 5-stage cascade
        match_result = await self._cascade.evaluate(
            profile=profile,
            job=job,
            rule=custom_rule or MatchRule(),
            resume=resume,
        )

        # Save to database
        saved_match = await self._match_repo.save(match_result)
        logger.info(
            f"Evaluated match for Job [{job.title}] vs User [{user_id}]: "
            f"Score={saved_match.overall_score}% | Decision={saved_match.decision.value}"
        )
        return saved_match


class BatchEvaluateJobsUseCase:
    """Batch evaluates un-matched jobs for a candidate profile."""

    def __init__(
        self,
        evaluate_use_case: EvaluateJobMatchUseCase,
        job_repo: JobRepository,
    ):
        self._eval_use_case = evaluate_use_case
        self._job_repo = job_repo

    async def execute(self, user_id: str, limit: int = 20) -> List[MatchResult]:
        jobs = await self._job_repo.list_jobs(skip=0, limit=limit)
        results: List[MatchResult] = []

        for job in jobs:
            try:
                res = await self._eval_use_case.execute(user_id=user_id, job_id=job.id)
                results.append(res)
            except Exception as e:
                logger.warning(f"Failed to evaluate job {job.id}: {e}")

        return results


class ListMatchesUseCase:
    def __init__(self, match_repo: MatchResultRepository):
        self._match_repo = match_repo

    async def execute(
        self,
        user_id: str,
        min_score: Optional[float] = None,
        decision: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[MatchResult]:
        return await self._match_repo.list_by_user(
            user_id=user_id,
            min_score=min_score,
            decision=decision,
            skip=skip,
            limit=limit,
        )
