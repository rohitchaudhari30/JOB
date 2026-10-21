from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List


class WorkflowStateEnum(str, Enum):
    DISCOVERED = "DISCOVERED"
    MATCHING = "MATCHING"
    MATCHED = "MATCHED"
    SHORTLISTED = "SHORTLISTED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    APPROVED = "APPROVED"
    APPLYING = "APPLYING"
    FORM_DETECTED = "FORM_DETECTED"
    FORM_FILLED = "FORM_FILLED"
    QUESTIONS_PENDING = "QUESTIONS_PENDING"
    READY_TO_SUBMIT = "READY_TO_SUBMIT"
    SUBMITTING = "SUBMITTING"
    APPLIED = "APPLIED"

    # Pauses & Exceptions
    PAUSED_OTP = "PAUSED_OTP"
    PAUSED_CAPTCHA = "PAUSED_CAPTCHA"
    PAUSED_USER_INPUT = "PAUSED_USER_INPUT"
    PAUSED_AUTH_EXPIRED = "PAUSED_AUTH_EXPIRED"
    PAUSED_SESSION = "PAUSED_SESSION"
    PAUSED_LIMIT = "PAUSED_LIMIT"
    RETRY_QUEUED = "RETRY_QUEUED"
    SUBMISSION_UNKNOWN = "SUBMISSION_UNKNOWN"
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


class ApplicationOutcomeStatus(str, Enum):
    NOT_SUBMITTED = "NOT_SUBMITTED"
    UNKNOWN = "UNKNOWN"
    SUBMITTED = "SUBMITTED"
    RESPONDED = "RESPONDED"
    INTERVIEWING = "INTERVIEWING"
    OFFERED = "OFFERED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


@dataclass
class ApplicationQuestion:
    id: str
    application_id: str
    question_text: str
    canonical_intent: str | None = None
    answer_provided: str | None = None
    answered_by: str = "SAVED_ANSWER"  # 'SAVED_ANSWER', 'AI_GENERATED', 'USER_INPUT'
    confidence_score: float = 1.0


@dataclass
class ApplicationEvent:
    id: str
    application_id: str
    event_name: str
    payload: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None


@dataclass
class Application:
    id: str
    user_id: str
    job_id: str
    resume_id: str | None = None
    idempotency_key: str = ""
    workflow_state: WorkflowStateEnum = WorkflowStateEnum.DISCOVERED
    outcome_status: ApplicationOutcomeStatus = ApplicationOutcomeStatus.NOT_SUBMITTED
    applied_at: datetime | None = None
    failure_reason: str | None = None
    trace_file_path: str | None = None
    screenshot_file_path: str | None = None
    retry_count: int = 0
    error_category: str | None = None
    next_retry_at: datetime | None = None
    current_attempt_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    job_title: str | None = None
    company: str | None = None
    location: str | None = None
    min_experience_years: float | None = None
    max_experience_years: float | None = None
    min_salary: float | None = None
    max_salary: float | None = None
    salary_currency: str | None = "INR"
    apply_url: str | None = None
    platform: str | None = None
    match_score: float | None = None
    questions: List[ApplicationQuestion] = field(default_factory=list)
    tailored_resume_id: str | None = None
