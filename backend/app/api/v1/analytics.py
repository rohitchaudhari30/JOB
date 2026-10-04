from typing import List
from fastapi import APIRouter, Depends
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
    total_applied: int
    total_interviewed: int
    total_offered: int
    total_rejected: int
    stages: List[FunnelStageDTO]


class ResumePerformanceDTO(BaseModel):
    resume_id: str
    label: str
    target_role: str
    applications_count: int
    interview_count: int
    offer_count: int
    conversion_rate_pct: float


class SourcePerformanceDTO(BaseModel):
    source_id: str
    source_type: str = "naukri"
    discovered_count: int
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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    result = await service.get_funnel_overview(current_user.id)
    return FunnelOverviewResponse(
        total_discovered=result.total_discovered,
        total_matched=result.total_matched,
        total_applied=result.total_applied,
        total_interviewed=result.total_interviewed,
        total_offered=result.total_offered,
        total_rejected=result.total_rejected,
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
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_resume_performance(current_user.id)
    return [
        ResumePerformanceDTO(
            resume_id=r.resume_id,
            label=r.label,
            target_role=r.target_role,
            applications_count=r.applications_count,
            interview_count=r.interview_count,
            offer_count=r.offer_count,
            conversion_rate_pct=r.conversion_rate_pct,
        )
        for r in res
    ]


@router.get("/sources", response_model=List[SourcePerformanceDTO])
async def get_source_performance(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_source_performance(current_user.id)
    return [
        SourcePerformanceDTO(
            source_id=s.source_id,
            discovered_count=s.discovered_count,
            applied_count=s.applied_count,
            success_rate_pct=s.success_rate_pct,
        )
        for s in res
    ]


@router.get("/skills", response_model=List[SkillDemandDTO])
async def get_skill_insights(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
):
    service = AnalyticsService(session)
    res = await service.get_skill_insights(current_user.id)
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
