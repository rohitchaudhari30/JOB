from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID


from app.domain.applications.entities import WorkflowStateEnum


class ApplicationSource(str, Enum):
    DIRECT_APPLY = "DIRECT_APPLY"
    CAMPAIGN = "CAMPAIGN"
    JOB_DISCOVERY = "JOB_DISCOVERY"
    AI_MATCHES = "AI_MATCHES"
    DASHBOARD = "DASHBOARD"
    REVIEW_QUEUE = "REVIEW_QUEUE"
    AUTOMATION = "AUTOMATION"


@dataclass
class QueueApplicationCommand:
    """
    Canonical command representing a validated intent to queue an application for execution.
    All entry points (Job Discovery, AI Matches, Dashboard, Campaigns, Automation) MUST produce this command.
    """
    user_id: str
    job_id: str
    source: ApplicationSource
    campaign_id: Optional[str] = None
    resume_id: Optional[str] = None
    auto_execute: bool = False
    metadata: Optional[Dict[str, Any]] = None
    initial_state: Optional[WorkflowStateEnum] = None


@dataclass
class BatchQueueApplicationCommand:
    """
    Canonical command for queuing a batch of applications (e.g. from Job Discovery or Campaigns).
    """
    user_id: str
    job_ids: List[str]
    source: ApplicationSource
    campaign_id: Optional[str] = None
    resume_id: Optional[str] = None
    auto_execute: bool = False
