from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.application.dashboard.dashboard_service import DashboardService
from app.core.database import get_db_session
from app.domain.auth.entities import User

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class ActiveRunStatusDTO(BaseModel):
    is_running: bool
    run_id: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    status: str
    current_job_title: Optional[str] = None
    current_platform: Optional[str] = None
    progress_percentage: float


class AttentionItemDTO(BaseModel):
    id: str
    type: str
    title: str
    description: str
    action_label: str
    action_url: str
    severity: str


class ReadinessItemDTO(BaseModel):
    key: str
    title: str
    is_ready: bool
    action_label: str
    action_url: str


class TopRecommendedJobDTO(BaseModel):
    job_id: str
    title: str
    company: str
    location: str
    platform: str
    match_score: float
    apply_url: Optional[str] = None
    decision: str


class DashboardOverviewResponse(BaseModel):
    today_applied_count: int
    effective_daily_limit: int
    quota_remaining: int
    quota_percentage: float
    active_run: ActiveRunStatusDTO
    needs_attention: List[AttentionItemDTO]
    readiness: List[ReadinessItemDTO]
    top_matches: List[TopRecommendedJobDTO]


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    client_tz: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = DashboardService(session)
    overview = await service.get_overview(user_id=current_user.id, client_tz=client_tz)
    return DashboardOverviewResponse(
        today_applied_count=overview.today_applied_count,
        effective_daily_limit=overview.effective_daily_limit,
        quota_remaining=overview.quota_remaining,
        quota_percentage=overview.quota_percentage,
        active_run=ActiveRunStatusDTO(
            is_running=overview.active_run.is_running,
            run_id=overview.active_run.run_id,
            campaign_id=overview.active_run.campaign_id,
            campaign_name=overview.active_run.campaign_name,
            status=overview.active_run.status,
            current_job_title=overview.active_run.current_job_title,
            current_platform=overview.active_run.current_platform,
            progress_percentage=overview.active_run.progress_percentage,
        ),
        needs_attention=[
            AttentionItemDTO(
                id=item.id,
                type=item.type,
                title=item.title,
                description=item.description,
                action_label=item.action_label,
                action_url=item.action_url,
                severity=item.severity,
            )
            for item in overview.needs_attention
        ],
        readiness=[
            ReadinessItemDTO(
                key=item.key,
                title=item.title,
                is_ready=item.is_ready,
                action_label=item.action_label,
                action_url=item.action_url,
            )
            for item in overview.readiness
        ],
        top_matches=[
            TopRecommendedJobDTO(
                job_id=job.job_id,
                title=job.title,
                company=job.company,
                location=job.location,
                platform=job.platform,
                match_score=job.match_score,
                apply_url=job.apply_url,
                decision=job.decision,
            )
            for job in overview.top_matches
        ],
    )
