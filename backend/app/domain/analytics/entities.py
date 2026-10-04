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
    total_applied: int
    total_interviewed: int
    total_offered: int
    total_rejected: int
    stages: List[FunnelStageMetric]


@dataclass
class ResumePerformanceMetric:
    resume_id: str
    label: str
    target_role: str
    applications_count: int
    interview_count: int
    offer_count: int
    conversion_rate_pct: float


@dataclass
class SourcePerformanceMetric:
    source_id: str
    source_type: str = "naukri"
    discovered_count: int = 0
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
