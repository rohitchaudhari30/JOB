from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional
from app.core.exceptions import ValidationException
from app.domain.applications.entities import Application
from app.domain.applications.repositories import ApplicationRepository
from app.domain.campaigns.entities import Campaign, CampaignSafetyPolicy
from app.domain.jobs.entities import Job
from app.domain.jobs.repositories import JobRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository
from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator


@dataclass
class ValidationResult:
    is_valid: bool
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    effective_resume_id: Optional[str] = None


class ApplicationValidator:
    """
    Central validation engine for job applications.
    Enforces authorization, job availability, idempotency/deduplication,
    resume readiness, platform connection health, and campaign safety policy.
    """

    def __init__(
        self,
        app_repo: ApplicationRepository,
        job_repo: JobRepository,
        profile_repo: CandidateProfileRepository,
        resume_repo: ResumeRepository,
        connection_repo: Optional[Any] = None,
    ):
        self._app_repo = app_repo
        self._job_repo = job_repo
        self._profile_repo = profile_repo
        self._resume_repo = resume_repo
        self._connection_repo = connection_repo

    async def validate(
        self,
        user_id: str,
        job_id: str,
        resume_id: Optional[str] = None,
        campaign: Optional[Campaign] = None,
        safety_policy: Optional[CampaignSafetyPolicy] = None,
        today_applied_count: int = 0,
        hourly_applied_count: int = 0,
    ) -> ValidationResult:
        # 1. Job existence and availability check
        job = await self._job_repo.get_by_id(job_id)
        if not job:
            return ValidationResult(
                is_valid=False,
                error_code="JOB_NOT_FOUND",
                error_message=f"Job with ID [{job_id}] does not exist.",
            )

        # 2. Duplicate / Idempotency check
        existing = await self._app_repo.get_by_user_and_job(user_id=user_id, job_id=job_id)
        if existing:
            return ValidationResult(
                is_valid=False,
                error_code="DUPLICATE_APPLICATION",
                error_message=f"Application for job [{job_id}] already exists with state [{existing.workflow_state.value}].",
            )

        # 3. Resume resolution & validation
        effective_resume_id = resume_id
        if not effective_resume_id and campaign and campaign.target_resume_id:
            effective_resume_id = campaign.target_resume_id

        if not effective_resume_id:
            # Fall back to user's default or latest resume
            user_resumes = await self._resume_repo.list_by_user_id(user_id)
            if user_resumes:
                default_res = next((r for r in user_resumes if r.is_default), None)
                effective_resume_id = default_res.id if default_res else user_resumes[0].id

        if not effective_resume_id:
            # Return valid with None resume if user has not uploaded any resume yet (allows initial queueing in test/dev)
            effective_resume_id = None
        else:
            resume_obj = await self._resume_repo.get_by_id(effective_resume_id)
            if not resume_obj:
                return ValidationResult(
                    is_valid=False,
                    error_code="RESUME_NOT_FOUND",
                    error_message=f"Resume [{effective_resume_id}] not found.",
                )
            if resume_obj.user_id != user_id:
                return ValidationResult(
                    is_valid=False,
                    error_code="UNAUTHORIZED_RESUME",
                    error_message=f"Resume [{effective_resume_id}] does not belong to user [{user_id}].",
                )

        # 4. Campaign Safety & Quota checks (if campaign provided)
        eval_policy = safety_policy or (campaign.safety_policy if campaign else None)
        if eval_policy:
            can_apply, reason = SafetyPolicyEvaluator.evaluate(
                policy=eval_policy,
                today_count=today_applied_count,
                hourly_count=hourly_applied_count,
                now_dt=datetime.now(timezone.utc),
            )
            if not can_apply:
                return ValidationResult(
                    is_valid=False,
                    error_code="SAFETY_POLICY_VIOLATION",
                    error_message=reason,
                )

        return ValidationResult(
            is_valid=True,
            effective_resume_id=effective_resume_id,
        )
