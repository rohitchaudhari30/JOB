import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

logger = logging.getLogger("app.api.v1.automation")
from app.application.automation.execution_sync import sync_control_state
from app.domain.campaigns.state_machine import ExecutionStateEnum
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
    get_campaign_execution_repository,
    get_campaign_repository,
    get_automation_run_repository,
)
from app.application.automation.orchestrator import (
    AutomationRunStatus,
    AutomationSession,
    orchestrator,
)
from app.domain.ai.contracts import AIGateway
from app.domain.auth.entities import User
from app.domain.matching.entities import MatchRule
from app.workers.scheduler_worker import (
    ScheduleJobConfig,
    delete_saved_schedule,
    save_schedule,
    scheduled_run_callback,
    scheduler_worker,
)

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
    max_job_age_hours: Optional[float] = None
    prefer_fresh_hours: Optional[float] = 6.0
    auto_apply_threshold: float = 85.0
    approval_threshold: float = 70.0
    headless: bool = True  # True = ⚡ Silent Background (Default), False = 🖥️ Visible Desktop Window
    execution_id: Optional[str] = None
    campaign_id: Optional[str] = None
    worker_id: Optional[str] = "worker-1"
    resume_id: Optional[str] = None


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
    last_event_seq: int = 0
    worker_health: str = "HEALTHY"
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


def _to_run_response(session: AutomationSession, worker_health: str = "HEALTHY") -> RunStatusResponse:
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
        last_event_seq=getattr(session, "_event_seq", 0),
        worker_health=worker_health,
        created_at=session.created_at,
        completed_at=session.completed_at,
    )


def _row_to_run_response(model, default_status: AutomationRunStatus) -> RunStatusResponse:
    """Builds the API response from a stored run row (used when the run is no longer in memory)."""
    status_enum = AutomationRunStatus(model.status) if model.status in AutomationRunStatus._value2member_map_ else default_status
    seconds_since_heartbeat = 0.0
    if model.last_heartbeat_at:
        beat = model.last_heartbeat_at
        if beat.tzinfo is None:
            beat = beat.replace(tzinfo=timezone.utc)
        seconds_since_heartbeat = (datetime.now(timezone.utc) - beat).total_seconds()
    is_stale = model.status in ("RUNNING", "STARTING") and seconds_since_heartbeat > 300
    return RunStatusResponse(
        run_id=model.id,
        user_id=model.user_id,
        status=status_enum,
        active_state=model.status,
        is_paused=(model.status == "PAUSED"),
        discovered_jobs_count=model.discovered_count,
        matched_jobs_count=model.matched_count,
        applications_submitted_count=model.applied_count,
        current_job_title=model.current_job_title,
        current_application_id=model.current_job_id,
        error_message=model.error_message,
        last_event_seq=getattr(model, "last_event_seq", 0),
        worker_health="STALE" if is_stale else "HEALTHY",
        created_at=model.created_at,
        completed_at=model.finished_at,
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
    campaign_repo=Depends(get_campaign_repository),
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)] = None,
):
    live_run_id = await orchestrator.get_live_run_id(current_user.id)
    if live_run_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active automation run [{live_run_id}] is already in progress.",
        )

    # Determine effective resume: explicit request resume > campaign target resume
    effective_resume_id = req.resume_id
    if not effective_resume_id and req.campaign_id and campaign_repo:
        campaign = await campaign_repo.get_by_id(req.campaign_id)
        if campaign and campaign.target_resume_id:
            effective_resume_id = campaign.target_resume_id

    # Strict multi-tenancy & existence verification for effective resume
    if effective_resume_id:
        resume_entity = await resume_repo.get_by_id(effective_resume_id)
        if not resume_entity:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Resume [{effective_resume_id}] not found.",
            )
        if resume_entity.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized access to specified resume.",
            )

    rule = MatchRule(
        skills_weight=req.skills_weight,
        experience_weight=req.experience_weight,
        role_title_weight=req.role_title_weight,
        location_weight=req.location_weight,
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
        headless=req.headless,
        execution_id=req.execution_id,
        campaign_id=req.campaign_id,
        worker_id=req.worker_id or "worker-1",
        resume_id=effective_resume_id,
    )
    return _to_run_response(session)


@router.get("/active", response_model=Optional[RunStatusResponse])
async def get_active_user_run(
    current_user: Annotated[User, Depends(get_current_user)],
    run_repo=Depends(get_automation_run_repository),
):
    session = orchestrator.get_active_user_run(current_user.id)
    if session and session.status not in (
        AutomationRunStatus.COMPLETED,
        AutomationRunStatus.ABORTED,
        AutomationRunStatus.FAILED,
    ):
        return _to_run_response(session)

    # Database fallback for active runs across worker restarts
    model = await run_repo.get_latest_active_row(current_user.id)
    if model:
        return _row_to_run_response(model, default_status=AutomationRunStatus.RUNNING)
    return None


@router.get("/runs/{run_id}", response_model=RunStatusResponse)
async def get_run_status(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    run_repo=Depends(get_automation_run_repository),
):
    session = orchestrator.get_session(run_id)
    if session:
        if session.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
        return _to_run_response(session)

    # Database fallback for completed or persisted runs
    model = await run_repo.get_row(run_id)
    if not model or model.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    return _row_to_run_response(model, default_status=AutomationRunStatus.COMPLETED)


@router.get("/runs/{run_id}/events", response_model=List[Dict[str, Any]])
async def get_run_events(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    after_seq: Optional[int] = Query(None, description="Cursor: return only events with seq > after_seq"),
    limit: int = Query(1000, ge=1, le=5000, description="Max events per page. Continue with after_seq = last seq."),
    run_repo=Depends(get_automation_run_repository),
):
    session = orchestrator.get_session(run_id)
    if session:
        if session.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
        all_events = sorted(getattr(session, "events", []), key=lambda e: e.get("seq") or 0)
        if after_seq is not None:
            all_events = [e for e in all_events if (e.get("seq") or 0) > after_seq]
        return all_events[:limit]

    # Database fallback for finished/historical runs
    run_model = await run_repo.get_row(run_id)
    if not run_model or run_model.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")

    events = await run_repo.list_event_rows(run_id, after_seq, limit)
    return [
        {
            "type": "AUTOMATION_TIMELINE_EVENT",
            "id": e.id,
            "seq": e.seq,
            "run_id": e.run_id,
            "event_name": e.event_name,
            "state": (e.payload or {}).get("state", "RUNNING"),
            "message": (e.payload or {}).get("message", e.event_name),
            "stats": (e.payload or {}).get("stats", {}),
            "payload": e.payload or {},
            "timestamp": e.created_at.isoformat() if e.created_at else "",
        }
        for e in events
    ]


@router.post("/runs/{run_id}/pause", response_model=RunStatusResponse)
async def pause_run(
    run_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    execution_repo=Depends(get_campaign_execution_repository),
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    session.pause()

    await sync_control_state(execution_repo, session.execution_id, ExecutionStateEnum.PAUSED_USER, "pause")

    return _to_run_response(session)


@router.post("/runs/{run_id}/resume", response_model=RunStatusResponse)
async def resume_run(
    run_id: str,
    req: ResumeRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    execution_repo=Depends(get_campaign_execution_repository),
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    session.resume(user_input=req.user_input)

    await sync_control_state(execution_repo, session.execution_id, ExecutionStateEnum.RUNNING, "resume")

    return _to_run_response(session)


@router.post("/runs/{run_id}/stop", response_model=RunStatusResponse)
async def stop_run(
    run_id: str,
    req: StopRunRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    execution_repo=Depends(get_campaign_execution_repository),
):
    session = orchestrator.get_session(run_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run [{run_id}] not found.")
    session.abort(reason=req.reason or "Aborted by user")

    await sync_control_state(execution_repo, session.execution_id, ExecutionStateEnum.ABORTED, "stop")

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

    success = scheduler_worker.add_schedule(
        config=config,
        task_callable=scheduled_run_callback,
        schedule_id=config.schedule_id,
        user_id=config.user_id,
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to register schedule.")
    await save_schedule(config)

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
    await delete_saved_schedule(schedule_id)
    return None
