from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict
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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    questions: List[ApplicationQuestionDTO] = []


class CreateApplicationDTO(BaseModel):
    job_id: str
    resume_id: Optional[str] = None


class ApproveApplicationDTO(BaseModel):
    resume_id: Optional[str] = None
    auto_execute: bool = True


class ResumeApplicationDTO(BaseModel):
    user_input: Optional[str] = None  # E.g., OTP code or confirmation token


class TakeControlDTO(BaseModel):
    reason: Optional[str] = "User requested manual control"


class StopApplicationDTO(BaseModel):
    reason: Optional[str] = "User aborted run"


class ApplicationStatsDTO(BaseModel):
    total: int
    applied: int
    paused: int
    failed: int
    approval_required: int
