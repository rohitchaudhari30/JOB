from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domain.resume_tailoring.status import TailoringStatus

MODE_EDIT = "EDIT"                          # DOCX: a tailored file can be produced
MODE_SUGGESTIONS_ONLY = "SUGGESTIONS_ONLY"  # PDF and others: analysis and suggested wording only


@dataclass
class TailoredResume:
    id: str
    user_id: str
    master_resume_id: Optional[str]
    master_file_hash: str
    job_id: str
    job_description_hash: str
    input_hash: str
    status: TailoringStatus = TailoringStatus.QUEUED
    mode: str = MODE_EDIT
    version: int = 1
    master_label_snapshot: Optional[str] = None
    job_title_snapshot: Optional[str] = None
    company_snapshot: Optional[str] = None
    analysis: Optional[Dict[str, Any]] = None
    edit_plan: Optional[Dict[str, Any]] = None
    approved_edit_ids: Optional[List[str]] = None
    validation: Optional[Dict[str, Any]] = None
    file_path: Optional[str] = None
    pdf_file_path: Optional[str] = None
    file_name: Optional[str] = None
    file_hash: Optional[str] = None
    provider: Optional[str] = None
    model_name: Optional[str] = None
    prompt_version: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    attempt_count: int = 0
    lease_owner: Optional[str] = None
    lease_expires_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


@dataclass
class ConfirmedFactRecord:
    id: str
    user_id: str
    master_resume_id: str
    term: str
    details: str
    source: str = "USER_CONFIRMED"
    created_at: Optional[datetime] = None


@dataclass(frozen=True)
class TailoredUploadRef:
    """What the apply step needs to send a tailored file instead of the master."""

    id: str
    user_id: str
    job_id: str
    status: str
    file_path: Optional[str]
    label: str
