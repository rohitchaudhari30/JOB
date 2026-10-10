from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.application.analytics.analytics_service import AnalyticsService
from app.core.database import get_db_session
from app.domain.auth.entities import User

router = APIRouter(prefix="/analytics", tags=["Analytics"])


class FunnelStageDTO(BaseModel):
    stage_name: str
    count: int
    conversion_rate_pct: float


class FunnelOverviewResponse(BaseModel):
    total_discovered: int
    total_matched: int
    total_triggered: int
    total_submitted: int
    total_responded: int
    total_interviewed: int
    total_offered: int
    total_rejected: int
    match_rate_pct: float
    trigger_rate_pct: float
    submission_rate_pct: float
    response_rate_pct: float
    interview_rate_pct: float
    offer_rate_pct: float
    total_applied: int
    stages: List[FunnelStageDTO]


class ResumePerformanceDTO(BaseModel):
    resume_id: str
    label: str
    target_role: str
    applications_count: int
    response_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    response_rate_pct: float = 0.0
    interview_rate_pct: float = 0.0
    offer_rate_pct: float = 0.0
    conversion_rate_pct: float


class SourcePerformanceDTO(BaseModel):
    source_id: str
    source_type: str = "naukri"
    discovered_count: int
    matched_count: int = 0
    triggered_count: int = 0
    submitted_count: int = 0
    response_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    response_rate_pct: float = 0.0
    interview_rate_pct: float = 0.0
    offer_rate_pct: float = 0.0
    applied_count: int
    success_rate_pct: float


class CampaignPerformanceDTO(BaseModel):
    campaign_id: str
    campaign_name: str
    state: str
    discovered_count: int
    matched_count: int = 0
    triggered_count: int = 0
    submitted_count: int = 0
    response_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    response_rate_pct: float = 0.0
    interview_rate_pct: float = 0.0
    offer_rate_pct: float = 0.0
    applied_count: int
    success_rate_pct: float


class SkillDemandDTO(BaseModel):
    skill_name: str
    matched_frequency: int
    missing_frequency: int
    market_demand_score: float


class WeightTuningResponse(BaseModel):
    current_skill_weight: float
    current_semantic_weight: float
    current_experience_weight: float
    recommended_skill_weight: float
    recommended_semantic_weight: float
    recommended_experience_weight: float
    confidence_score: float
    rationale: str


@router.get("/funnel", response_model=FunnelOverviewResponse)
async def get_funnel(
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    platform: Optional[str] = Query(None, description="Platform filter (e.g. 'naukri', 'linkedin')"),
    campaign_id: Optional[str] = Query(None, description="Campaign filter"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    result = await service.get_funnel_overview(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
        platform=platform,
        campaign_id=campaign_id,
    )
    return FunnelOverviewResponse(
        total_discovered=result.total_discovered,
        total_matched=result.total_matched,
        total_triggered=result.total_triggered,
        total_submitted=result.total_submitted,
        total_responded=result.total_responded,
        total_interviewed=result.total_interviewed,
        total_offered=result.total_offered,
        total_rejected=result.total_rejected,
        match_rate_pct=result.match_rate_pct,
        trigger_rate_pct=result.trigger_rate_pct,
        submission_rate_pct=result.submission_rate_pct,
        response_rate_pct=result.response_rate_pct,
        interview_rate_pct=result.interview_rate_pct,
        offer_rate_pct=result.offer_rate_pct,
        total_applied=result.total_applied,
        stages=[
            FunnelStageDTO(
                stage_name=s.stage_name,
                count=s.count,
                conversion_rate_pct=s.conversion_rate_pct,
            )
            for s in result.stages
        ],
    )


@router.get("/resumes", response_model=List[ResumePerformanceDTO])
async def get_resume_performance(
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_resume_performance(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        ResumePerformanceDTO(
            resume_id=r.resume_id,
            label=r.label,
            target_role=r.target_role,
            applications_count=r.applications_count,
            response_count=r.response_count,
            interview_count=r.interview_count,
            offer_count=r.offer_count,
            response_rate_pct=r.response_rate_pct,
            interview_rate_pct=r.interview_rate_pct,
            offer_rate_pct=r.offer_rate_pct,
            conversion_rate_pct=r.conversion_rate_pct,
        )
        for r in res
    ]


@router.get("/sources", response_model=List[SourcePerformanceDTO])
async def get_source_performance(
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_source_performance(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        SourcePerformanceDTO(
            source_id=s.source_id,
            source_type=s.source_type,
            discovered_count=s.discovered_count,
            matched_count=s.matched_count,
            triggered_count=s.triggered_count,
            submitted_count=s.submitted_count,
            response_count=s.response_count,
            interview_count=s.interview_count,
            offer_count=s.offer_count,
            response_rate_pct=s.response_rate_pct,
            interview_rate_pct=s.interview_rate_pct,
            offer_rate_pct=s.offer_rate_pct,
            applied_count=s.applied_count,
            success_rate_pct=s.success_rate_pct,
        )
        for s in res
    ]


@router.get("/campaigns", response_model=List[CampaignPerformanceDTO])
async def get_campaign_performance(
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_campaign_performance(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        CampaignPerformanceDTO(
            campaign_id=c.campaign_id,
            campaign_name=c.campaign_name,
            state=c.state,
            discovered_count=c.discovered_count,
            matched_count=c.matched_count,
            triggered_count=c.triggered_count,
            submitted_count=c.submitted_count,
            response_count=c.response_count,
            interview_count=c.interview_count,
            offer_count=c.offer_count,
            response_rate_pct=c.response_rate_pct,
            interview_rate_pct=c.interview_rate_pct,
            offer_rate_pct=c.offer_rate_pct,
            applied_count=c.applied_count,
            success_rate_pct=c.success_rate_pct,
        )
        for c in res
    ]


@router.get("/skills", response_model=List[SkillDemandDTO])
async def get_skill_insights(
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_skill_insights(
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        SkillDemandDTO(
            skill_name=s.skill_name,
            matched_frequency=s.matched_frequency,
            missing_frequency=s.missing_frequency,
            market_demand_score=s.market_demand_score,
        )
        for s in res
    ]


@router.get("/weights-tuning", response_model=WeightTuningResponse)
async def get_weight_tuning(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_weight_tuning_recommendations(current_user.id)
    return WeightTuningResponse(
        current_skill_weight=res.current_skill_weight,
        current_semantic_weight=res.current_semantic_weight,
        current_experience_weight=res.current_experience_weight,
        recommended_skill_weight=res.recommended_skill_weight,
        recommended_semantic_weight=res.recommended_semantic_weight,
        recommended_experience_weight=res.recommended_experience_weight,
        confidence_score=res.confidence_score,
        rationale=res.rationale,
    )


class AIStatusResponse(BaseModel):
    primary_provider: str = "groq"
    primary_model: str
    fallback_provider: str = "gemini"
    fallback_model: str
    is_groq_rate_limited: bool
    remaining_cooldown_seconds: int
    active_routing: str


@router.get("/ai-status", response_model=AIStatusResponse)
async def get_ai_status():
    from app.infrastructure.ai.gateway import MultiTierAIGateway
    from app.core.config import settings

    is_limited = MultiTierAIGateway.is_rate_limit_active()
    remaining = MultiTierAIGateway.get_remaining_cooldown()
    active = f"gemini ({settings.GEMINI_DEFAULT_MODEL})" if is_limited else f"groq ({settings.GROQ_DEFAULT_MODEL})"
    return AIStatusResponse(
        primary_provider="groq",
        primary_model=settings.GROQ_DEFAULT_MODEL,
        fallback_provider="gemini",
        fallback_model=settings.GEMINI_DEFAULT_MODEL,
        is_groq_rate_limited=is_limited,
        remaining_cooldown_seconds=remaining,
        active_routing=active,
    )
