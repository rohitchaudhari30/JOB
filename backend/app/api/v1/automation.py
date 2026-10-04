from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from app.api.deps import (
    get_ai_gateway,
    get_application_repository,
    get_current_user,
    get_job_repository,
    get_job_source_repository,
    get_matching_repository,
    get_profile_repository,
    get_resume_repository,
    get_user_repository,
)
from app.application.automation.orchestrator import (
    AutomationRunStatus,
    AutomationSession,
    orchestrator,
)
from app.domain.ai.contracts import AIGateway
from app.domain.auth.entities import User
from app.domain.matching.entities import MatchRule
from app.workers.scheduler_worker import ScheduleJobConfig, scheduler_worker

router = APIRouter(prefix="/automation", tags=["Automation Runs & Scheduling"])


class StartRunRequest(BaseModel):
    source_type: str = "naukri"
    roles: List[str] = Field(min_length=1)
    locations: Optional[List[str]] = None
    min_salary: Optional[float] = None
    auto_apply_matches: bool = True
    max_applications: int = 10
    skills_weight: float = 0.35
    experience_weight: float = 0.20
    role_title_weight: float = 0.15
    location_weight: float = 0.10
    freshness_weight: float = 0.10
    max_job_age_hours: Optional[float] = None
    prefer_fresh_hours: Optional[float] = 6.0
    auto_apply_threshold: float = 85.0
    approval_threshold: float = 70.0


class RunStatusResponse(BaseModel):
    run_id: str
    user_id: str
    status: AutomationRunStatus
    active_state: str
    is_paused: bool
    discovered_jobs_count: int
    matched_jobs_count: int
    applications_submitted_count: int
    current_job_title: Optional[str] = None
    current_application_id: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class ResumeRunRequest(BaseModel):
    user_input: Optional[str] = None  # OTP or challenge response


class StopRunRequest(BaseModel):
    reason: Optional[str] = "User requested stop"


class CreateScheduleRequest(BaseModel):
    source_type: str = "naukri"
    roles: List[str] = Field(min_length=1)
    locations: Optional[List[str]] = None
    cron_expression: Optional[str] = None  # e.g., "0 9 * * 1-5"
    interval_minutes: Optional[int] = None  # e.g., 180
    auto_apply: bool = True
    max_applications_per_run: int = 10


def _to_run_response(session: AutomationSession) -> RunStatusResponse:
    return RunStatusResponse(
        run_id=session.run_id,
        user_id=session.user_id,
        status=session.status,
        active_state=session.active_state,
        is_paused=session.is_paused,
        discovered_jobs_count=session.discovered_jobs_count,
        matched_jobs_count=session.matched_jobs_count,
        applications_submitted_count=session.applications_submitted_count,
        current_job_title=session.current_job_title,
        current_application_id=session.current_application_id,
        error_message=session.error_message,
        created_at=session.created_at,
        completed_at=session.completed_at,
    )


@router.post("/start", response_model=RunStatusResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_automation_run(
    req: StartRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    job_repo=Depends(get_job_repository),
    source_repo=Depends(get_job_source_repository),
    profile_repo=Depends(get_profile_repository),
    resume_repo=Depends(get_resume_repository),
    match_repo=Depends(get_matching_repository),
    app_repo=Depends(get_application_repository),
    user_repo=Depends(get_user_repository),
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)] = None,
):
    existing_run = orchestrator.get_active_user_run(current_user.id)
    if existing_run and existing_run.status == AutomationRunStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active automation run [{existing_run.run_id}] is already in progress.",
        )

    rule = MatchRule(
        skills_weight=req.skills_weight,
        experience_weight=req.experience_weight,
        role_title_weight=req.role_title_weight,
        location_weight=req.location_weight,
        freshness_weight=req.freshness_weight,
        max_job_age_hours=req.max_job_age_hours,
        prefer_fresh_hours=req.prefer_fresh_hours,
        auto_apply_threshold=req.auto_apply_threshold,
        approval_threshold=req.approval_threshold,
    )

    session = await orchestrator.start_run(
        user_id=current_user.id,
        source_type=req.source_type,
        roles=req.roles,
        locations=req.locations,
        min_salary=req.min_salary,
        match_rule=rule,
        auto_apply_matches=req.auto_apply_matches,
        max_applications=req.max_applications,
        job_repo=job_repo,
        source_repo=source_repo,
        profile_repo=profile_repo,
        resume_repo=resume_repo,
        match_repo=match_repo,
        app_repo=app_repo,
        user_repo=user_repo,
        ai_gateway=ai_gateway,
    )
    return _to_run_response(session)


@router.get("/runs/{run_id}", response_model=RunStatusResponse)
async def get_run_status(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    return _to_run_response(session)


@router.post("/runs/{run_id}/pause", response_model=RunStatusResponse)
async def pause_run(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    session.pause()
    return _to_run_response(session)


@router.post("/runs/{run_id}/resume", response_model=RunStatusResponse)
async def resume_run(
    run_id: str,
    req: ResumeRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    session.resume(user_input=req.user_input)
    return _to_run_response(session)


@router.post("/runs/{run_id}/stop", response_model=RunStatusResponse)
async def stop_run(
    run_id: str,
    req: StopRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    session.abort(reason=req.reason or "Aborted by user")
    return _to_run_response(session)


# --- Scheduling Endpoints ---


@router.get("/schedules", response_model=List[ScheduleJobConfig])
async def list_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
):
    return scheduler_worker.list_schedules_for_user(current_user.id)


@router.post("/schedules", response_model=ScheduleJobConfig, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    req: CreateScheduleRequest,
    current_user: Annotated[User, Depends(get_current_user)],
):
    if not req.cron_expression and not req.interval_minutes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify either cron_expression or interval_minutes.",
        )

    config = ScheduleJobConfig(
        schedule_id=f"sched_{uuid.uuid4().hex[:8]}",
        user_id=current_user.id,
        source_type=req.source_type,
        roles=req.roles,
        locations=req.locations or [],
        cron_expression=req.cron_expression,
        interval_minutes=req.interval_minutes,
        auto_apply=req.auto_apply,
        max_applications_per_run=req.max_applications_per_run,
        created_at=datetime.now(timezone.utc),
    )

    async def scheduled_task(**kwargs):
        logger.info(f"Triggering scheduled automation run [{config.schedule_id}] for user [{config.user_id}]...")

    success = scheduler_worker.add_schedule(config=config, task_callable=scheduled_task)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to register schedule.")

    return config


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    cfg = scheduler_worker.get_schedule(schedule_id)
    if not cfg or cfg.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Schedule [{schedule_id}] not found.")

    scheduler_worker.remove_schedule(schedule_id)
    return None
