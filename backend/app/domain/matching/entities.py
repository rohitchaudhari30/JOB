from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class RecommendationDecision(str, Enum):
    AUTO_APPLY = "AUTO_APPLY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    SAVE = "SAVE"
    REJECT = "REJECT"


# Backward-compatible alias for existing consumers
DecisionEnum = RecommendationDecision


class MatchingTaskStatus(str, Enum):
    QUEUED = "QUEUED"
    LEASED = "LEASED"
    COMPLETED = "COMPLETED"
    RETRY = "RETRY"
    FAILED = "FAILED"


class IdentityConfidenceEnum(str, Enum):
    PLATFORM_EXACT = "PLATFORM_EXACT"
    CANONICAL_DERIVED = "CANONICAL_DERIVED"
    POSSIBLE_DUPLICATE = "POSSIBLE_DUPLICATE"


@dataclass
class MatchBreakdown:
    skill_score: float = 0.0
    experience_score: float = 0.0
    role_title_score: float = 0.0
    location_score: float = 0.0
    salary_score: float = 0.0
    semantic_score: float = 0.0
    freshness_score: float = 0.0
    ai_score: float = 0.0

    def to_dict(self) -> Dict[str, float]:
        return {
            "skill_score": round(self.skill_score, 1),
            "experience_score": round(self.experience_score, 1),
            "role_title_score": round(self.role_title_score, 1),
            "location_score": round(self.location_score, 1),
            "salary_score": round(self.salary_score, 1),
            "semantic_score": round(self.semantic_score, 1),
            "freshness_score": round(self.freshness_score, 1),
            "ai_score": round(self.ai_score, 1),
        }


@dataclass
class MatchRule:
    skills_weight: float = 0.35
    experience_weight: float = 0.20
    role_title_weight: float = 0.15
    location_weight: float = 0.10
    salary_weight: float = 0.10
    freshness_weight: float = 0.10
    education_weight: float = 0.05
    notice_period_weight: float = 0.05
    min_match_score: float = 60.0
    auto_apply_threshold: float = 90.0
    approval_threshold: float = 75.0
    max_job_age_hours: float | None = None
    prefer_fresh_hours: float | None = 6.0
    freshness_score_table: Dict[str, float] | None = None


@dataclass
class RecommendationResult:
    recommendation_score: float
    decision: RecommendationDecision
    reasons: List[str] = field(default_factory=list)
    blocking_reasons: List[str] = field(default_factory=list)


@dataclass
class MatchResult:
    id: str
    user_id: str
    job_id: str
    resume_id: str | None = None
    evaluation_key: str = ""

    # Dual Scores: Pure candidate-job fit vs Operational recommendation priority
    match_score: float = 0.0  # 0 to 100
    recommendation_score: float | None = None  # 0 to 100
    overall_score: float = 0.0  # [DEPRECATED] Maintained identical to match_score for backward compatibility

    # Dimensional Breakdown
    breakdown: MatchBreakdown = field(default_factory=MatchBreakdown)
    hard_filter_passed: bool = True
    skill_match_score: float = 0.0
    experience_score: float = 0.0
    role_title_score: float = 0.0
    location_score: float = 0.0
    salary_score: float = 0.0
    semantic_score: float = 0.0
    freshness_score: float = 0.0
    ai_score: float = 0.0

    # Immutable Snapshot Hashes & Version Snapshots
    resume_version: int = 1
    resume_snapshot_hash: str = ""
    profile_version: int = 1
    profile_snapshot_hash: str = ""
    job_snapshot_hash: str = ""
    matching_engine_version: str = "4.0.0"
    matching_config_version: str = "v1"
    prompt_version: str = "match-v2"
    embedding_model: str = "all-MiniLM-L6-v2"
    embedding_version: str = "2026.1"

    # Explainability & Operational Recommendations
    reasoning_summary: str = ""
    matched_skills: List[str] = field(default_factory=list)
    missing_skills: List[str] = field(default_factory=list)
    decision: RecommendationDecision = RecommendationDecision.REQUIRE_APPROVAL
    recommendation_reasons: List[str] = field(default_factory=list)
    blocking_reasons: List[str] = field(default_factory=list)

    # Telemetry
    ai_provider_used: str = "groq"
    ai_model: str | None = None
    duration_ms: int = 0
    created_at: datetime | None = None

    # Job Context
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    apply_url: str | None = None
    raw_posted_text: str | None = None

    def __post_init__(self):
        # Guarantee overall_score sync with match_score if not explicitly specified
        if self.overall_score == 0.0 and self.match_score > 0.0:
            self.overall_score = self.match_score
        elif self.match_score == 0.0 and self.overall_score > 0.0:
            self.match_score = self.overall_score


@dataclass
class MatchingTask:
    id: str
    user_id: str
    job_id: str
    task_idempotency_key: str
    campaign_id: Optional[str] = None
    resume_id: Optional[str] = None
    status: MatchingTaskStatus = MatchingTaskStatus.QUEUED
    attempt_count: int = 0
    max_attempts: int = 3
    worker_id: Optional[str] = None
    lease_version: int = 1
    leased_at: Optional[datetime] = None
    lease_expires_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
