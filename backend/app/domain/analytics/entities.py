from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class FunnelStageMetric:
    stage_name: str
    count: int
    conversion_rate_pct: float


@dataclass
class FunnelOverview:
    total_discovered: int
    total_matched: int
    total_triggered: int
    total_submitted: int  # Confirmed Submissions
    total_responded: int  # Employer Responses
    total_interviewed: int  # Interviews
    total_offered: int  # Offers
    total_rejected: int
    # Explicit Rates
    match_rate_pct: float = 0.0
    trigger_rate_pct: float = 0.0
    submission_rate_pct: float = 0.0
    response_rate_pct: float = 0.0
    interview_rate_pct: float = 0.0
    offer_rate_pct: float = 0.0
    total_applied: int = 0  # alias for backwards compatibility
    stages: List[FunnelStageMetric] = field(default_factory=list)


@dataclass
class ResumePerformanceMetric:
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
    conversion_rate_pct: float = 0.0


@dataclass
class SourcePerformanceMetric:
    source_id: str
    source_type: str = "naukri"
    discovered_count: int = 0
    matched_count: int = 0
    triggered_count: int = 0
    submitted_count: int = 0
    response_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    response_rate_pct: float = 0.0
    interview_rate_pct: float = 0.0
    offer_rate_pct: float = 0.0
    applied_count: int = 0
    success_rate_pct: float = 0.0


@dataclass
class SkillDemandInsight:
    skill_name: str
    matched_frequency: int
    missing_frequency: int
    market_demand_score: float


@dataclass
class WeightTuningRecommendation:
    current_skill_weight: float
    current_semantic_weight: float
    current_experience_weight: float
    recommended_skill_weight: float
    recommended_semantic_weight: float
    recommended_experience_weight: float
    confidence_score: float
    rationale: str


@dataclass
class CampaignPerformanceMetric:
    campaign_id: str
    campaign_name: str
    state: str
    discovered_count: int = 0
    matched_count: int = 0
    triggered_count: int = 0
    submitted_count: int = 0
    response_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    response_rate_pct: float = 0.0
    interview_rate_pct: float = 0.0
    offer_rate_pct: float = 0.0
    applied_count: int = 0
    success_rate_pct: float = 0.0
