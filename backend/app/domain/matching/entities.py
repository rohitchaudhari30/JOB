from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List


class DecisionEnum(str, Enum):
    AUTO_APPLY = "AUTO_APPLY"
    REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
    SAVE = "SAVE"
    SKIP = "SKIP"
    REJECT = "REJECT"


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
class MatchResult:
    id: str
    user_id: str
    job_id: str
    resume_id: str | None = None
    overall_score: float = 0.0  # 0 to 100
    hard_filter_passed: bool = True
    skill_match_score: float = 0.0
    semantic_score: float = 0.0
    freshness_score: float = 0.0
    reasoning_summary: str = ""
    matched_skills: List[str] = field(default_factory=list)
    missing_skills: List[str] = field(default_factory=list)
    decision: DecisionEnum = DecisionEnum.REQUIRE_APPROVAL
    ai_provider_used: str = "groq"
    scoring_version: str = "v1"
    created_at: datetime | None = None
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    apply_url: str | None = None
    raw_posted_text: str | None = None
