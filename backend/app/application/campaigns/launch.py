"""Starts a campaign and its automation run in one server-side step (AUT-15).

Used by the Run button (POST /campaigns/{id}/launch) and by the campaign scheduler, so a scheduled
run goes through exactly the same checks as a manual one.
"""
from dataclasses import dataclass
from typing import Any, List, Optional

from app.application.campaigns.use_cases import StartCampaignExecutionUseCase
from app.core.exceptions import ConflictException, EntityNotFoundException
from app.domain.matching.entities import MatchRule


@dataclass
class LaunchOptions:
    """Anything left out comes from the saved campaign."""

    roles: Optional[List[str]] = None
    locations: Optional[List[str]] = None
    resume_id: Optional[str] = None
    auto_apply_matches: bool = True
    max_job_age_hours: Optional[float] = None
    headless: bool = True


@dataclass
class LaunchResult:
    execution: Any
    run_id: str
    status: str


async def launch_campaign_run(
    *,
    orchestrator: Any,
    user_id: str,
    campaign_id: str,
    options: LaunchOptions,
    campaign_repo: Any,
    execution_repo: Any,
    log_repo: Any,
    connection_manager: Any,
    connection_repo: Any,
    resume_repo: Any,
    worker_id: str = "worker-1",
    pipeline_repos: Optional[dict] = None,
) -> LaunchResult:
    """Raises ConflictException (a run is live) or EntityNotFoundException (campaign/resume not the user's).

    `pipeline_repos` are optional job/source/profile/... repositories; when omitted the pipeline opens its own.
    """
    live_run_id = await orchestrator.get_live_run_id(user_id)
    if live_run_id:
        raise ConflictException(f"An active automation run [{live_run_id}] is already in progress.")

    campaign = await campaign_repo.get_by_id(campaign_id)
    if not campaign or campaign.user_id != user_id:
        raise EntityNotFoundException("Campaign", campaign_id)

    resume_id = options.resume_id or campaign.target_resume_id
    if resume_id:
        resume = await resume_repo.get_by_id(resume_id)
        if not resume or resume.user_id != user_id:
            raise EntityNotFoundException("Resume", resume_id)

    roles = options.roles or campaign.rule.target_roles or ["Software Engineer"]
    locations = options.locations or campaign.rule.target_locations or None
    source_type = (campaign.rule.target_platforms or ["naukri"])[0].lower()

    start_use_case = StartCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=execution_repo,
        log_repo=log_repo,
        connection_manager=connection_manager,
        connection_repo=connection_repo,
    )
    execution = await start_use_case.execute(campaign_id=campaign_id, user_id=user_id, worker_id=worker_id)

    rule = MatchRule(
        auto_apply_threshold=campaign.rule.auto_apply_threshold,
        approval_threshold=campaign.rule.review_threshold,
        max_job_age_hours=options.max_job_age_hours,
    )
    session = await orchestrator.start_run(
        user_id=user_id,
        source_type=source_type,
        roles=roles,
        locations=locations,
        min_salary=None,
        match_rule=rule,
        auto_apply_matches=options.auto_apply_matches,
        max_applications=campaign.safety_policy.daily_application_limit,
        headless=options.headless,
        execution_id=execution.id,
        campaign_id=campaign_id,
        worker_id=execution.worker_id or worker_id,
        resume_id=resume_id,
        **(pipeline_repos or {}),
    )
    return LaunchResult(execution=execution, run_id=session.run_id, status=session.status.value)
