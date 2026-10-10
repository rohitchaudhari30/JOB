from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import (
    get_campaign_activity_log_repository,
    get_campaign_execution_repository,
    get_campaign_repository,
    get_connection_manager,
    get_connection_repository,
    get_current_user,
)
from app.application.campaigns.safety_evaluator import SafetyPolicyEvaluator
from app.application.campaigns.use_cases import (
    CreateCampaignUseCase,
    DeleteCampaignUseCase,
    GetCampaignActivityLogsUseCase,
    GetCampaignUseCase,
    ListCampaignsUseCase,
    PauseCampaignExecutionUseCase,
    RecordWorkerHeartbeatUseCase,
    ReclaimAbandonedExecutionsUseCase,
    ResumeCampaignExecutionUseCase,
    StartCampaignExecutionUseCase,
    StopCampaignExecutionUseCase,
    UpdateCampaignUseCase,
)
from app.core.exceptions import EntityNotFoundException, ValidationException
from app.domain.auth.entities import User
from app.domain.campaigns.entities import Campaign, CampaignExecution
from app.domain.campaigns.state_machine import InvalidStateTransitionException

router = APIRouter(prefix="/campaigns", tags=["Automation Campaigns"])


class CampaignRuleSchema(BaseModel):
    auto_apply_threshold: float = Field(80.0, ge=0.0, le=100.0)
    review_threshold: float = Field(65.0, ge=0.0, le=100.0)
    min_experience_years: float = Field(0.0, ge=0.0)
    max_experience_years: float = Field(10.0, ge=0.0)
    target_roles: List[str] = Field(default_factory=list)
    target_locations: List[str] = Field(default_factory=list)
    mandatory_skills: List[str] = Field(default_factory=list)
    excluded_keywords: List[str] = Field(default_factory=list)
    target_platforms: List[str] = Field(default_factory=lambda: ["naukri"])


class CampaignSafetyPolicySchema(BaseModel):
    daily_application_limit: int = Field(20, ge=1, le=100)
    hourly_application_limit: int = Field(5, ge=1, le=20)
    cooldown_seconds: int = Field(90, ge=10, le=600)
    operating_start_time: str = "09:00"
    operating_end_time: str = "18:00"
    max_concurrent_applications: int = Field(1, ge=1, le=5)


class CampaignScheduleSchema(BaseModel):
    is_active: bool = False
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = 240
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None


class CreateCampaignRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    target_resume_id: Optional[str] = None
    rule: Optional[CampaignRuleSchema] = None
    safety_policy: Optional[CampaignSafetyPolicySchema] = None
    schedule: Optional[CampaignScheduleSchema] = None


class UpdateCampaignRequest(BaseModel):
    name: Optional[str] = None
    state: Optional[str] = None
    target_resume_id: Optional[str] = None
    rule: Optional[CampaignRuleSchema] = None
    safety_policy: Optional[CampaignSafetyPolicySchema] = None
    schedule: Optional[CampaignScheduleSchema] = None


class CampaignResponse(BaseModel):
    id: str
    user_id: str
    name: str
    state: str
    target_resume_id: Optional[str] = None
    rule: CampaignRuleSchema
    safety_policy: CampaignSafetyPolicySchema
    schedule: CampaignScheduleSchema
    created_at: datetime
    updated_at: datetime


class CampaignExecutionResponse(BaseModel):
    id: str
    campaign_id: str
    user_id: str
    status: str
    worker_id: Optional[str] = None
    heartbeat_at: Optional[datetime] = None
    lease_version: int = 1
    started_at: datetime
    completed_at: Optional[datetime] = None
    discovered_count: int = 0
    qualified_count: int = 0
    queued_count: int = 0
    submitted_count: int = 0
    failed_count: int = 0
    error_message: Optional[str] = None


class CampaignActivityLogResponse(BaseModel):
    id: str
    execution_id: str
    level: str
    event_type: str
    message: str
    metadata: Dict[str, Any]
    created_at: datetime


class CampaignPacingStatusResponse(BaseModel):
    campaign_id: str
    today_count: int
    daily_limit: int
    hourly_count: int
    hourly_limit: int
    cooldown_seconds: int
    is_within_window: bool
    can_apply_now: bool
    status_reason: str
    active_execution_status: Optional[str] = None
    active_job_title: Optional[str] = None
    active_job_company: Optional[str] = None
    next_action_label: Optional[str] = None
    attention_required: Optional[str] = None
    cooldown_remaining_seconds: Optional[int] = None


def _to_campaign_response(c: Campaign) -> CampaignResponse:
    return CampaignResponse(
        id=c.id,
        user_id=c.user_id,
        name=c.name,
        state=c.state,
        target_resume_id=c.target_resume_id,
        rule=CampaignRuleSchema(
            auto_apply_threshold=c.rule.auto_apply_threshold,
            review_threshold=c.rule.review_threshold,
            min_experience_years=c.rule.min_experience_years,
            max_experience_years=c.rule.max_experience_years,
            target_roles=c.rule.target_roles,
            target_locations=c.rule.target_locations,
            mandatory_skills=c.rule.mandatory_skills,
            excluded_keywords=c.rule.excluded_keywords,
            target_platforms=c.rule.target_platforms,
        ),
        safety_policy=CampaignSafetyPolicySchema(
            daily_application_limit=c.safety_policy.daily_application_limit,
            hourly_application_limit=c.safety_policy.hourly_application_limit,
            cooldown_seconds=c.safety_policy.cooldown_seconds,
            operating_start_time=c.safety_policy.operating_start_time,
            operating_end_time=c.safety_policy.operating_end_time,
            max_concurrent_applications=c.safety_policy.max_concurrent_applications,
        ),
        schedule=CampaignScheduleSchema(
            is_active=c.schedule.is_active,
            cron_expression=c.schedule.cron_expression,
            interval_minutes=c.schedule.interval_minutes,
            last_run_at=c.schedule.last_run_at,
            next_run_at=c.schedule.next_run_at,
        ),
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


def _to_execution_response(e: CampaignExecution) -> CampaignExecutionResponse:
    return CampaignExecutionResponse(
        id=e.id,
        campaign_id=e.campaign_id,
        user_id=e.user_id,
        status=e.status,
        worker_id=e.worker_id,
        heartbeat_at=e.heartbeat_at,
        lease_version=getattr(e, "lease_version", 1) or 1,
        started_at=e.started_at,
        completed_at=e.completed_at,
        discovered_count=e.discovered_count,
        qualified_count=e.qualified_count,
        queued_count=e.queued_count,
        submitted_count=e.submitted_count,
        failed_count=e.failed_count,
        error_message=e.error_message,
    )


@router.post("", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    req: CreateCampaignRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
):
    use_case = CreateCampaignUseCase(campaign_repo)
    try:
        created = await use_case.execute(
            user_id=current_user.id,
            name=req.name,
            target_resume_id=req.target_resume_id,
            rule_data=req.rule.model_dump() if req.rule else None,
            safety_data=req.safety_policy.model_dump() if req.safety_policy else None,
            schedule_data=req.schedule.model_dump() if req.schedule else None,
        )
        return _to_campaign_response(created)
    except ValidationException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[CampaignResponse])
async def list_campaigns(
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    use_case = ListCampaignsUseCase(campaign_repo)
    campaigns = await use_case.execute(user_id=current_user.id, limit=limit, skip=skip)
    return [_to_campaign_response(c) for c in campaigns]


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
):
    use_case = GetCampaignUseCase(campaign_repo)
    try:
        campaign = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id)
        return _to_campaign_response(campaign)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    req: UpdateCampaignRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
):
    use_case = UpdateCampaignUseCase(campaign_repo)
    try:
        updated = await use_case.execute(
            campaign_id=campaign_id,
            user_id=current_user.id,
            name=req.name,
            state=req.state,
            target_resume_id=req.target_resume_id,
            rule_data=req.rule.model_dump() if req.rule else None,
            safety_data=req.safety_policy.model_dump() if req.safety_policy else None,
            schedule_data=req.schedule.model_dump() if req.schedule else None,
        )
        return _to_campaign_response(updated)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
):
    use_case = DeleteCampaignUseCase(campaign_repo)
    success = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Campaign not found.")


@router.post("/{campaign_id}/start", response_model=CampaignExecutionResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_campaign(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    execution_repo=Depends(get_campaign_execution_repository),
    log_repo=Depends(get_campaign_activity_log_repository),
    conn_mgr=Depends(get_connection_manager),
    conn_repo=Depends(get_connection_repository),
    worker_id: str = Query("worker-1"),
):
    use_case = StartCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=execution_repo,
        log_repo=log_repo,
        connection_manager=conn_mgr,
        connection_repo=conn_repo,
    )
    try:
        execution = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id, worker_id=worker_id)
        return _to_execution_response(execution)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/leases/reclaim", response_model=Dict[str, Any])
async def reclaim_abandoned_execution_leases(
    current_user: Annotated[User, Depends(get_current_user)],
    execution_repo=Depends(get_campaign_execution_repository),
):
    use_case = ReclaimAbandonedExecutionsUseCase(execution_repo)
    reclaimed_count = await use_case.execute()
    return {"reclaimed_executions": reclaimed_count}


@router.post("/{campaign_id}/heartbeat", response_model=CampaignExecutionResponse)
async def record_campaign_worker_heartbeat(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    execution_repo=Depends(get_campaign_execution_repository),
    worker_id: str = Query("worker-1"),
    lease_seconds: int = Query(300, ge=10, le=3600),
    lease_version: Optional[int] = Query(None),
):
    active = await execution_repo.get_active_by_campaign(campaign_id)
    if not active or active.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="No active execution found for this campaign.")
    use_case = RecordWorkerHeartbeatUseCase(execution_repo)
    updated = await use_case.execute(
        active.id,
        worker_id=worker_id,
        lease_seconds=lease_seconds,
        lease_version=lease_version,
    )
    if not updated:
        raise HTTPException(
            status_code=409,
            detail="Heartbeat rejected: worker or lease fencing token mismatch, or execution not renewable.",
        )
    return _to_execution_response(updated)


@router.post("/executions/{execution_id}/heartbeat", response_model=CampaignExecutionResponse)
async def record_execution_heartbeat(
    execution_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    execution_repo=Depends(get_campaign_execution_repository),
    worker_id: str = Query("worker-1"),
    lease_seconds: int = Query(300, ge=10, le=3600),
    lease_version: Optional[int] = Query(None),
):
    exec_item = await execution_repo.get_by_id(execution_id)
    if not exec_item or exec_item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Execution not found.")
    use_case = RecordWorkerHeartbeatUseCase(execution_repo)
    updated = await use_case.execute(
        execution_id,
        worker_id=worker_id,
        lease_seconds=lease_seconds,
        lease_version=lease_version,
    )
    if not updated:
        raise HTTPException(
            status_code=409,
            detail="Heartbeat rejected: worker or lease fencing token mismatch, or execution not renewable.",
        )
    return _to_execution_response(updated)


@router.post("/{campaign_id}/pause", response_model=CampaignExecutionResponse)
async def pause_campaign(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    execution_repo=Depends(get_campaign_execution_repository),
    log_repo=Depends(get_campaign_activity_log_repository),
):
    from app.application.automation.orchestrator import orchestrator

    use_case = PauseCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=execution_repo,
        log_repo=log_repo,
    )
    try:
        execution = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id)
        # Signal active browser session if running
        active_sess = orchestrator.get_active_user_run(current_user.id) or orchestrator.get_session(execution.id)
        if active_sess and (active_sess.campaign_id == campaign_id or active_sess.execution_id == execution.id):
            active_sess.pause()
        return _to_execution_response(execution)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidStateTransitionException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{campaign_id}/resume", response_model=CampaignExecutionResponse)
async def resume_campaign(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    execution_repo=Depends(get_campaign_execution_repository),
    log_repo=Depends(get_campaign_activity_log_repository),
):
    from app.application.automation.orchestrator import orchestrator

    use_case = ResumeCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=execution_repo,
        log_repo=log_repo,
    )
    try:
        execution = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id)
        # Signal active browser session if paused
        active_sess = orchestrator.get_active_user_run(current_user.id) or orchestrator.get_session(execution.id)
        if active_sess and (active_sess.campaign_id == campaign_id or active_sess.execution_id == execution.id):
            active_sess.resume()
        return _to_execution_response(execution)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidStateTransitionException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{campaign_id}/stop", response_model=CampaignExecutionResponse)
async def stop_campaign(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    execution_repo=Depends(get_campaign_execution_repository),
    log_repo=Depends(get_campaign_activity_log_repository),
):
    from app.application.automation.orchestrator import orchestrator

    use_case = StopCampaignExecutionUseCase(
        campaign_repo=campaign_repo,
        execution_repo=execution_repo,
        log_repo=log_repo,
    )
    try:
        execution = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id)
        # Signal active browser session to abort
        active_sess = orchestrator.get_active_user_run(current_user.id) or orchestrator.get_session(execution.id)
        if active_sess and (active_sess.campaign_id == campaign_id or active_sess.execution_id == execution.id):
            active_sess.abort(reason="Stopped from campaign control")
        return _to_execution_response(execution)
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidStateTransitionException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{campaign_id}/pacing", response_model=CampaignPacingStatusResponse)
async def get_campaign_pacing_status(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    execution_repo=Depends(get_campaign_execution_repository),
):
    campaign = await campaign_repo.get_by_id(campaign_id)
    if not campaign or campaign.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Campaign not found.")

    today_count = await campaign_repo.count_today_applications(campaign_id)
    hourly_count = await campaign_repo.count_hourly_applications(campaign_id)
    is_window = SafetyPolicyEvaluator.is_within_operating_window(campaign.safety_policy)
    can_apply, reason = SafetyPolicyEvaluator.evaluate(
        policy=campaign.safety_policy,
        today_count=today_count,
        hourly_count=hourly_count,
    )

    # Operational Cockpit Telemetry
    active_exec = await execution_repo.get_active_by_campaign(campaign_id)
    active_status = active_exec.status if active_exec else "IDLE"
    attention_req = None
    next_action = "Standby — waiting for next scheduled run or manual trigger"
    cooldown_rem = None

    if active_exec:
        if active_exec.status == "RUNNING":
            next_action = f"Cooldown active — resumes in {campaign.safety_policy.cooldown_seconds}s"
            cooldown_rem = campaign.safety_policy.cooldown_seconds
        elif active_exec.status == "PAUSED_OTP":
            attention_req = "1 OTP challenge required on job portal"
            next_action = "Awaiting candidate OTP submission in Live Console"
        elif active_exec.status == "PAUSED_CAPTCHA":
            attention_req = "1 CAPTCHA challenge required"
            next_action = "Awaiting candidate CAPTCHA solving in Live Console"
        elif active_exec.status == "PAUSED_SESSION":
            attention_req = "Platform session expired. Re-authentication required"
            next_action = "Please refresh connection credentials in Platform Connections"
        elif active_exec.status == "PAUSED_LIMIT":
            next_action = f"Daily limit reached ({today_count}/{campaign.safety_policy.daily_application_limit}). Resuming in next window"
        elif active_exec.status == "PAUSED_USER":
            next_action = "Paused by candidate. Click Resume to continue"

    return CampaignPacingStatusResponse(
        campaign_id=campaign.id,
        today_count=today_count,
        daily_limit=campaign.safety_policy.daily_application_limit,
        hourly_count=hourly_count,
        hourly_limit=campaign.safety_policy.hourly_application_limit,
        cooldown_seconds=campaign.safety_policy.cooldown_seconds,
        is_within_window=is_window,
        can_apply_now=can_apply,
        status_reason=reason,
        active_execution_status=active_status,
        next_action_label=next_action,
        attention_required=attention_req,
        cooldown_remaining_seconds=cooldown_rem,
    )


@router.get("/{campaign_id}/logs", response_model=List[CampaignActivityLogResponse])
async def list_campaign_logs(
    campaign_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    campaign_repo=Depends(get_campaign_repository),
    execution_repo=Depends(get_campaign_execution_repository),
    log_repo=Depends(get_campaign_activity_log_repository),
    limit: int = Query(50, ge=1, le=200),
):
    use_case = GetCampaignActivityLogsUseCase(
        campaign_repo=campaign_repo,
        execution_repo=execution_repo,
        log_repo=log_repo,
    )
    try:
        logs = await use_case.execute(campaign_id=campaign_id, user_id=current_user.id, limit=limit)
        return [
            CampaignActivityLogResponse(
                id=log.id,
                execution_id=log.execution_id,
                level=log.level,
                event_type=log.event_type,
                message=log.message,
                metadata=log.metadata,
                created_at=log.created_at,
            )
            for log in logs
        ]
    except EntityNotFoundException as e:
        raise HTTPException(status_code=404, detail=str(e))

