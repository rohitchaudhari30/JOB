from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List


@dataclass
class JobRequirement:
    mandatory_skills: List[str] = field(default_factory=list)
    preferred_skills: List[str] = field(default_factory=list)
    min_experience_years: float = 0.0
    max_experience_years: float = 0.0
    education_degree: str | None = None
    work_auth_required: str | None = None


@dataclass
class Job:
    id: str
    source_id: str
    external_job_id: str
    title: str
    company: str
    location: str
    source_type: str | None = None
    min_experience_years: float = 0.0
    max_experience_years: float = 0.0
    min_salary: float | None = None
    max_salary: float | None = None
    salary_currency: str = "INR"
    employment_type: str = "Full-time"
    apply_url: str = ""
    raw_description: str = ""
    parsed_requirements: Dict[str, Any] = field(default_factory=dict)
    embedding: List[float] | None = None
    is_active: bool = True
    posted_at: datetime | None = None
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    raw_posted_text: str | None = None
    posted_at_precision: str = "UNKNOWN"
    posted_at_source: str | None = None
    freshness_bucket: str = "UNKNOWN"
    freshness_score: float = 0.0
    canonical_job_key: str | None = None
    canonical_confidence: str = "PLATFORM_EXACT"  # PLATFORM_EXACT | CANONICAL_DERIVED | POSSIBLE_DUPLICATE
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class JobSource:
    id: str
    source_type: str  # 'naukri', 'linkedin', 'greenhouse', etc.
    base_url: str
    is_active: bool = True
    rate_limit_per_min: int = 20


@dataclass
class SearchQueryFilter:
    roles: List[str] = field(default_factory=list)
    # Company board names for ATS sources (Lever, Greenhouse, Ashby, Workday). Roles are job titles, not companies.
    companies: List[str] = field(default_factory=list)
    locations: List[str] = field(default_factory=list)
    min_experience: float = 0.0
    max_experience: float = 10.0
    experience: float | None = None
    min_salary: float | None = None
    max_days_posted: int = 7
    max_pages: int = 1
    sort_by_date: bool = True
