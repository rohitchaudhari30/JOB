from datetime import datetime
import json
import logging
from typing import Any, Dict, List, Optional
from app.application.matching.cascade import MatchingCascadeEngine
from app.application.matching.single_flight import matching_single_flight
from app.core.exceptions import EntityNotFoundException
from app.domain.ai.contracts import AIGateway
from app.domain.jobs.repositories import JobRepository
from app.domain.matching.entities import MatchResult, MatchRule
from app.domain.matching.repositories import MatchResultRepository, MatchingTaskRepository
from app.domain.matching.embedding import EmbeddingService
from app.domain.profile.repositories import (
    CandidateProfileRepository,
    ResumeRepository,
    SavedAnswerRepository,
)

logger = logging.getLogger("app.application.matching")


class EvaluateJobMatchUseCase:
    """
    Evaluates a single job against candidate profile using the authoritative 5-stage matching cascade.
    Supports complete resume selection hierarchy, snapshot hash caching, and decoupled recommendation.
    """

    def __init__(
        self,
        profile_repo: CandidateProfileRepository,
        job_repo: JobRepository,
        match_repo: MatchResultRepository,
        resume_repo: ResumeRepository,
        ai_gateway: AIGateway,
        saved_answer_repo: Optional[SavedAnswerRepository] = None,
        embedding_service: Optional[EmbeddingService] = None,
    ):
        self._profile_repo = profile_repo
        self._job_repo = job_repo
        self._match_repo = match_repo
        self._resume_repo = resume_repo
        self._saved_answer_repo = saved_answer_repo
        self._cascade = MatchingCascadeEngine(
            ai_gateway=ai_gateway,
            embedding_service=embedding_service,
        )

    async def execute(
        self,
        user_id: str,
        job_id: str,
        resume_id: Optional[str] = None,
        custom_rule: Optional[MatchRule] = None,
        force_reevaluate: bool = False,
    ) -> MatchResult:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            raise EntityNotFoundException("CandidateProfile", user_id)

        job = await self._job_repo.get_by_id(job_id)
        if not job:
            raise EntityNotFoundException("Job", job_id)

        # -------------------------------------------------------------------------
        # Resume Selection Hierarchy:
        # 1. Explicit request resume_id
        # 2. Candidate default resume (is_default == True)
        # 3. Most recent active resume (sorted by created_at desc)
        # 4. Profile only fallback (resume is None)
        # -------------------------------------------------------------------------
        resume = None
        if resume_id:
            resume = await self._resume_repo.get_by_id(resume_id)

        if not resume:
            try:
                resumes = await self._resume_repo.list_by_user_id(user_id)
                if resumes:
                    default_res = next((r for r in resumes if getattr(r, "is_default", False)), None)
                    if default_res:
                        resume = default_res
                    else:
                        sorted_resumes = sorted(
                            resumes,
                            key=lambda r: getattr(r, "created_at", None) or datetime.min,
                            reverse=True,
                        )
                        resume = sorted_resumes[0]
            except Exception as e:
                logger.warning(f"Could not load resumes for user {user_id}: {e}")

        # User tuned matching weights fallback
        rule_to_use = custom_rule
        if rule_to_use is None and self._saved_answer_repo:
            try:
                ans = await self._saved_answer_repo.find_by_intent(user_id, "matching_weights")
                if ans and ans.answer_text:
                    data = json.loads(ans.answer_text)
                    rule_to_use = MatchRule(
                        skills_weight=float(data.get("skills_weight", 0.35)),
                        experience_weight=float(data.get("experience_weight", 0.20)),
                        role_title_weight=float(data.get("role_title_weight", 0.15)),
                        location_weight=float(data.get("location_weight", 0.10)),
                        auto_apply_threshold=float(data.get("auto_apply_threshold", 90.0)),
                        approval_threshold=float(data.get("approval_threshold", 75.0)),
                    )
            except Exception as e:
                logger.warning(f"Could not load custom matching weights for user {user_id}: {e}")

        eval_key, _, _, _ = self._cascade.compute_evaluation_key(
            profile=profile,
            job=job,
            resume=resume,
            embedding_model=self._cascade._embedding_service.model_name,
            embedding_version=self._cascade._embedding_service.model_version,
            rule=rule_to_use or MatchRule(),
        )

        # Check existing evaluation cache by evaluation_key if not forcing re-evaluation
        if not force_reevaluate:
            cached_result = await self._match_repo.get_by_evaluation_key(
                user_id=user_id, job_id=job_id, evaluation_key=eval_key
            )
            if cached_result:
                logger.debug(
                    f"Cache hit for Job [{job_id}] vs User [{user_id}] with eval_key [{eval_key[:12]}]"
                )
                return cached_result

            # Single-flight deduplication: prevent duplicate AI cascade executions
            flight_key = f"eval:{user_id}:{job_id}:{eval_key}"

            async def _run_eval_and_persist() -> MatchResult:
                inner_cached = await self._match_repo.get_by_evaluation_key(
                    user_id=user_id, job_id=job_id, evaluation_key=eval_key
                )
                if inner_cached:
                    return inner_cached

                match_result = await self._cascade.evaluate(
                    profile=profile,
                    job=job,
                    rule=rule_to_use or MatchRule(),
                    resume=resume,
                )
                return await self._match_repo.save(match_result)

            saved_match, is_leader = await matching_single_flight.execute_or_join(
                flight_key, _run_eval_and_persist
            )
            logger.info(
                f"Evaluated match for Job [{job.title}] vs User [{user_id}] (leader={is_leader}): "
                f"MatchScore={saved_match.match_score}% | RecScore={saved_match.recommendation_score}% | "
                f"Decision={saved_match.decision.value}"
            )
            return saved_match

        # Force re-evaluation bypasses single-flight cache
        match_result = await self._cascade.evaluate(
            profile=profile,
            job=job,
            rule=rule_to_use or MatchRule(),
            resume=resume,
        )
        saved_match = await self._match_repo.save(match_result)
        logger.info(
            f"Force-evaluated match for Job [{job.title}] vs User [{user_id}]: "
            f"MatchScore={saved_match.match_score}% | RecScore={saved_match.recommendation_score}% | "
            f"Decision={saved_match.decision.value}"
        )
        return saved_match


class BatchEvaluateJobsUseCase:
    """Batch evaluates un-matched jobs for a candidate profile with bounded concurrency or async enqueuing."""

    def __init__(
        self,
        evaluate_use_case: EvaluateJobMatchUseCase,
        job_repo: JobRepository,
        matching_task_repo: Optional[MatchingTaskRepository] = None,
    ):
        self._eval_use_case = evaluate_use_case
        self._job_repo = job_repo
        self._matching_task_repo = matching_task_repo

    async def execute(
        self,
        user_id: str,
        limit: int = 20,
        async_enqueue: bool = False,
    ) -> List[Any]:
        jobs = await self._job_repo.list_jobs(skip=0, limit=limit)

        if async_enqueue and self._matching_task_repo:
            tasks = []
            for job in jobs:
                key = f"task_{user_id}_{job.id}"
                task = await self._matching_task_repo.enqueue_task(
                    user_id=user_id,
                    job_id=job.id,
                    task_idempotency_key=key,
                )
                tasks.append(task)
            logger.info(f"Enqueued {len(tasks)} matching tasks for user {user_id}")
            return tasks

        # One database session is shared by every repository here, and an AsyncSession
        # must not be used by several tasks at once, so jobs are evaluated one by one (AI-06).
        results: List[MatchResult] = []
        failed_job_ids: List[str] = []
        for job in jobs:
            try:
                results.append(await self._eval_use_case.execute(user_id=user_id, job_id=job.id))
            except Exception:
                failed_job_ids.append(job.id)
                logger.exception("Failed to evaluate job %s for user %s", job.id, user_id)

        if failed_job_ids:
            logger.warning(
                "Batch evaluation finished with %d failure(s) out of %d jobs",
                len(failed_job_ids),
                len(jobs),
            )
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
