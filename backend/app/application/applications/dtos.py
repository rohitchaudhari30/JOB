from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, computed_field
from app.domain.applications.display_status import derive_display_status, needs_attention as is_attention_state
from app.domain.applications.entities import WorkflowStateEnum


class ApplicationQuestionDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    question_text: str
    canonical_intent: Optional[str] = None
    answer_provided: Optional[str] = None
    answered_by: str
    confidence_score: float


class ApplicationResponseDTO(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    job_id: str
    resume_id: Optional[str] = None
    idempotency_key: str
    workflow_state: WorkflowStateEnum
    applied_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    trace_file_path: Optional[str] = None
    screenshot_file_path: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    min_experience_years: Optional[float] = None
    max_experience_years: Optional[float] = None
    min_salary: Optional[float] = None
    max_salary: Optional[float] = None
    salary_currency: Optional[str] = "INR"
    apply_url: Optional[str] = None
    platform: Optional[str] = None
    match_score: Optional[float] = None
    retry_count: int = 0
    error_category: Optional[str] = None
    next_retry_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    questions: List[ApplicationQuestionDTO] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def display_status(self) -> str:
        """User-facing status (server-owned; see domain/applications/display_status.py)."""
        return derive_display_status(self.workflow_state, self.failure_reason)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def needs_attention(self) -> bool:
        """True when the user must act or look (failed, paused, or submission unverified)."""
        return is_attention_state(self.workflow_state)


class CreateApplicationDTO(BaseModel):
    job_id: str
    resume_id: Optional[str] = None
    campaign_id: Optional[str] = None
    source: Optional[str] = "DIRECT_APPLY"
    auto_execute: bool = False


class BatchQueueApplicationsDTO(BaseModel):
    job_ids: List[str]
    resume_id: Optional[str] = None
    campaign_id: Optional[str] = None
    source: Optional[str] = "CAMPAIGN"
    auto_execute: bool = False


class ApproveApplicationDTO(BaseModel):
    resume_id: Optional[str] = None
    auto_execute: bool = True


class ResumeApplicationDTO(BaseModel):
    user_input: Optional[str] = None  # E.g., OTP code or confirmation token


class TakeControlDTO(BaseModel):
    reason: Optional[str] = "User requested manual control"


class StopApplicationDTO(BaseModel):
    reason: Optional[str] = "User aborted run"


class ReconcileApplicationDTO(BaseModel):
    action: str  # "CONFIRM_SUBMITTED" | "MARK_NOT_SUBMITTED" | "MARK_NOT_SUBMITTED_AND_RETRY" | "DISMISS"
    notes: Optional[str] = None


class ApplicationStatsDTO(BaseModel):
    total: int
    applied: int
    applied_today: int = 0
    paused: int
    failed: int
    skipped: int = 0
    approval_required: int
    reconciliation_required: int = 0
    needs_attention: int = 0
    success_rate: float = 0.0


class PaginatedApplicationsDTO(BaseModel):
    items: List[ApplicationResponseDTO]
    total: int
    page: int
    page_size: int
    total_pages: int
