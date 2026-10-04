from dataclasses import dataclass, field
from datetime import date, datetime
from typing import List


@dataclass
class CandidateSkill:
    id: str
    profile_id: str
    skill_name: str
    years_experience: float = 0.0
    is_primary: bool = False


@dataclass
class Experience:
    id: str
    profile_id: str
    company_name: str
    title: str
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool = False
    description: str | None = None


@dataclass
class Education:
    id: str
    profile_id: str
    institution: str
    degree: str
    field_of_study: str | None = None
    start_year: int | None = None
    end_year: int | None = None
    grade: str | None = None


@dataclass
class Resume:
    id: str
    user_id: str
    label: str
    target_role: str
    file_path: str
    file_name: str
    mime_type: str = "application/pdf"
    raw_text: str | None = None
    is_default: bool = False
    created_at: datetime | None = None


@dataclass
class SavedAnswer:
    id: str
    user_id: str
    canonical_intent: str
    question_pattern: str
    answer_text: str
    is_verified: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


@dataclass
class CandidateProfile:
    id: str
    user_id: str
    headline: str | None = None
    summary: str | None = None
    phone: str | None = None
    location: str | None = None
    current_ctc: float | None = None
    expected_ctc: float | None = None
    currency: str = "INR"
    notice_period_days: int = 30
    total_experience_months: int = 0
    work_authorization: str | None = None
    relocation_preference: bool = True
    remote_preference: str = "any"  # 'remote', 'hybrid', 'onsite', 'any'
    created_at: datetime | None = None
    updated_at: datetime | None = None
    experiences: List[Experience] = field(default_factory=list)
    educations: List[Education] = field(default_factory=list)
    skills: List[CandidateSkill] = field(default_factory=list)
