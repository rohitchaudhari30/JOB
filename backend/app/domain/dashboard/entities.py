from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ActiveRunStatus:
    is_running: bool = False
    run_id: Optional[str] = None
    campaign_id: Optional[str] = None
    campaign_name: Optional[str] = None
    status: str = "IDLE"  # RUNNING, PAUSED, IDLE, COMPLETED
    current_job_title: Optional[str] = None
    current_platform: Optional[str] = None
    progress_percentage: float = 0.0


@dataclass
class AttentionItem:
    id: str
    type: str  # OTP_REQUIRED, CAPTCHA_DETECTED, AUTH_EXPIRED, APPROVAL_PENDING, RATE_LIMIT_PAUSE
    title: str
    description: str
    action_label: str
    action_url: str
    severity: str = "HIGH"  # CRITICAL, HIGH, MEDIUM


@dataclass
class ReadinessItem:
    key: str
    title: str
    is_ready: bool
    action_label: str
    action_url: str


@dataclass
class TopRecommendedJob:
    job_id: str
    title: str
    company: str
    location: str
    platform: str
    match_score: float
    apply_url: Optional[str] = None
    decision: str = "AUTO_APPLY"


@dataclass
class DashboardOverview:
    # 1. Operational Today Quota
    today_applied_count: int
    effective_daily_limit: int
    quota_remaining: int
    quota_percentage: float

    # 2. Live Run / Automation Status
    active_run: ActiveRunStatus

    # 3. Action Blockers & Human-in-the-Loop Alerts
    needs_attention: List[AttentionItem]

    # 4. Profile & Platform Readiness Checklist
    readiness: List[ReadinessItem]

    # 5. Top Recommended Actionable Jobs Today
    top_matches: List[TopRecommendedJob]
