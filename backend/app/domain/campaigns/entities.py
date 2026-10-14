from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
import math
import random
from typing import Any, Dict, List, Optional
import uuid


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ErrorTaxonomyEnum(str, Enum):
    TRANSIENT = "TRANSIENT"
    AUTHENTICATION = "AUTHENTICATION"
    USER_ACTION_REQUIRED = "USER_ACTION_REQUIRED"
    JOB_UNAVAILABLE = "JOB_UNAVAILABLE"
    BUSINESS_RULE = "BUSINESS_RULE"
    VALIDATION = "VALIDATION"
    PERMANENT = "PERMANENT"
    ABORTED = "ABORTED"
    UNKNOWN = "UNKNOWN"


@dataclass
class ErrorClassification:
    category: ErrorTaxonomyEnum
    is_retryable: bool
    suggested_action: str
    message: str


def classify_automation_error(
    error_msg: str,
    retry_count: int = 0,
    is_cancelled: bool = False,
    is_session_expired: bool = False,
    max_retries: int = 3,
) -> ErrorClassification:
    """Intelligently categorizes application failures to prevent blind retries.
    Context-aware: accounts for explicit user stop/cancellation and session expiry before
    evaluating browser crash / disconnection patterns.
    """
    # 0. User / System Cancellation (ABORTED) - Never retry
    if is_cancelled:
        return ErrorClassification(
            category=ErrorTaxonomyEnum.ABORTED,
            is_retryable=False,
            suggested_action="Execution cancelled by user or operator.",
            message="Automation was intentionally stopped.",
        )

    msg = (error_msg or "").lower()

    if any(k in msg for k in ["aborted", "cancelled", "stopped by user", "execution stopped"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.ABORTED,
            is_retryable=False,
            suggested_action="Execution cancelled by user or operator.",
            message="Automation was intentionally stopped.",
        )

    # 1. AUTHENTICATION: Expired session / cookies or explicit session expiration flag
    if is_session_expired or any(k in msg for k in ["session expired", "logged out", "login required", "unauthorized", "401", "session invalid", "token expired"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.AUTHENTICATION,
            is_retryable=False,
            suggested_action="Refresh platform connection in Settings",
            message="Platform session expired or logged out.",
        )

    # 2. USER ACTION REQUIRED: Captcha / OTP
    if any(k in msg for k in ["captcha", "cloudflare", "challenge", "turnstile", "recaptcha", "hcaptcha", "bot check"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.USER_ACTION_REQUIRED,
            is_retryable=False,
            suggested_action="Solve CAPTCHA via Live Console",
            message="Anti-bot challenge encountered.",
        )
    if any(k in msg for k in ["otp", "verification code", "2fa", "two-factor", "sms code", "email code"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.USER_ACTION_REQUIRED,
            is_retryable=False,
            suggested_action="Enter OTP verification code via Live Console",
            message="Multi-factor authentication required.",
        )

    # 3. JOB UNAVAILABLE: Closed / Deleted / 404
    if any(k in msg for k in ["job closed", "no longer accepting", "expired job", "job expired", "closed by employer", "expired or closed", "404", "position closed", "vacancy filled"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.JOB_UNAVAILABLE,
            is_retryable=False,
            suggested_action="Skip job (posting is no longer active)",
            message="Job posting has been closed by the recruiter.",
        )

    # 4. BUSINESS RULE: Duplicate application
    if any(k in msg for k in ["already applied", "duplicate application", "applied previously", "uq_user_job"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.BUSINESS_RULE,
            is_retryable=False,
            suggested_action="Skip job (already applied)",
            message="Candidate has already submitted an application for this role.",
        )

    # 5. VALIDATION: Missing candidate details or profile fields
    if any(k in msg for k in ["missing required field", "unanswered question", "questions pending", "resume missing", "invalid resume"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.VALIDATION,
            is_retryable=False,
            suggested_action="Update profile or screening responses in Profile Manager",
            message="Mandatory employer screening fields or resume missing.",
        )

    # 6. TRANSIENT: Network drop, Timeout, Server 5xx, or genuine unexpected Playwright browser crash / closure
    if any(k in msg for k in [
        "timeout", "timed out", "navigation timeout", "net::err", "connection reset",
        "502", "503", "504", "browser disconnected",
        "target page, context or browser has been closed", "target closed",
        "page closed", "context closed", "browser has been closed",
    ]):
        is_ret = retry_count < max_retries
        return ErrorClassification(
            category=ErrorTaxonomyEnum.TRANSIENT,
            is_retryable=is_ret,
            suggested_action="Retry with fresh browser context and backoff" if is_ret else f"Max retries ({max_retries}) reached; inspect connection",
            message="Temporary network or browser disconnection.",
        )

    # 7. PERMANENT: Incompatible wizard or framework
    if any(k in msg for k in ["unsupported ats", "incompatible form", "blocked by policy", "forbidden", "403"]):
        return ErrorClassification(
            category=ErrorTaxonomyEnum.PERMANENT,
            is_retryable=False,
            suggested_action="Manual application required on company website",
            message="Portal form incompatible with automated form engine.",
        )

    # Default: UNKNOWN
    is_unknown_retryable = retry_count < 1
    return ErrorClassification(
        category=ErrorTaxonomyEnum.UNKNOWN,
        is_retryable=is_unknown_retryable,
        suggested_action="Review diagnostics in CRM" if not is_unknown_retryable else "Single transient retry allowed",
        message=error_msg or "Unknown error occurred.",
    )


def calculate_retry_backoff(retry_count: int, base_seconds: int = 60, max_seconds: int = 600, jitter: float = 0.2) -> int:
    """Calculates exponential backoff with jitter for transient retries."""
    delay = min(base_seconds * (2 ** retry_count), max_seconds)
    jitter_offset = delay * jitter * (random.random() * 2 - 1)  # +/- jitter %
    return max(15, int(delay + jitter_offset))


@dataclass
class CampaignRule:
    auto_apply_threshold: float = 80.0
    review_threshold: float = 65.0
    min_experience_years: float = 0.0
    max_experience_years: float = 10.0
    target_roles: List[str] = field(default_factory=list)
    target_locations: List[str] = field(default_factory=list)
    mandatory_skills: List[str] = field(default_factory=list)
    excluded_keywords: List[str] = field(default_factory=list)
    target_platforms: List[str] = field(default_factory=lambda: ["naukri"])


@dataclass
class CampaignSafetyPolicy:
    daily_application_limit: int = 20
    hourly_application_limit: int = 5
    cooldown_seconds: int = 90
    operating_start_time: str = "09:00"  # Format HH:MM
    operating_end_time: str = "18:00"    # Format HH:MM
    max_concurrent_applications: int = 1
    timezone: str = "UTC"  # IANA name, e.g. "Asia/Kolkata"; the operating window uses this clock


@dataclass
class CampaignSchedule:
    is_active: bool = False
    cron_expression: Optional[str] = None
    interval_minutes: Optional[int] = 240
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None


@dataclass
class Campaign:
    id: str
    user_id: str
    name: str
    state: str = "DRAFT"
    target_resume_id: Optional[str] = None
    rule: CampaignRule = field(default_factory=CampaignRule)
    safety_policy: CampaignSafetyPolicy = field(default_factory=CampaignSafetyPolicy)
    schedule: CampaignSchedule = field(default_factory=CampaignSchedule)
    created_at: datetime = field(default_factory=utc_now)
    updated_at: datetime = field(default_factory=utc_now)


@dataclass
class CampaignExecution:
    id: str
    campaign_id: str
    user_id: str
    status: str = "RUNNING"
    worker_id: Optional[str] = None
    heartbeat_at: Optional[datetime] = None
    lease_expires_at: Optional[datetime] = None
    lease_version: int = 1
    started_at: datetime = field(default_factory=utc_now)
    completed_at: Optional[datetime] = None
    discovered_count: int = 0
    qualified_count: int = 0
    queued_count: int = 0
    submitted_count: int = 0
    failed_count: int = 0
    error_message: Optional[str] = None


@dataclass
class CampaignJobItem:
    id: str
    execution_id: str
    job_id: str
    match_score: float = 0.0
    decision: str = "AUTO_APPLY"  # AUTO_APPLY | REVIEW | SKIP
    queue_status: str = "PENDING"  # PENDING | PROCESSING | SUBMITTED | FAILED | SKIPPED
    failure_reason: Optional[str] = None
    retry_count: int = 0
    error_category: Optional[str] = None
    next_retry_at: Optional[datetime] = None
    last_error: Optional[str] = None
    processed_at: Optional[datetime] = None


@dataclass
class CampaignActivityLog:
    id: str
    execution_id: str
    level: str = "INFO"  # INFO | WARNING | ERROR | CHALLENGE
    event_type: str = "GENERAL"
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=utc_now)


class QuotaReservationStatus(str, Enum):
    RESERVED = "RESERVED"
    CONSUMED = "CONSUMED"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"


@dataclass
class QuotaReservation:
    id: str
    campaign_id: str
    user_id: str
    execution_id: str
    job_id: str
    status: QuotaReservationStatus = QuotaReservationStatus.RESERVED
    reserved_at: datetime = field(default_factory=utc_now)
    expires_at: Optional[datetime] = None
    consumed_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
