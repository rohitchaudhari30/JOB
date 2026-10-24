from dataclasses import dataclass
from typing import Callable, Optional

from app.domain.connections.repositories import BrowserSessionRepository
from app.domain.profile.repositories import CandidateProfileRepository, ResumeRepository
from app.domain.jobs.repositories import JobRepository
from app.domain.resume_tailoring.ports import (
    ConfirmedFactRepository,
    DocumentToolkit,
    TailoredResumeRepository,
    TailoringAI,
)


@dataclass
class TailoringDeps:
    tailored: TailoredResumeRepository
    facts: ConfirmedFactRepository
    resumes: ResumeRepository
    jobs: JobRepository
    toolkit: DocumentToolkit
    ai: TailoringAI
    storage_root: str
    on_work_queued: Optional[Callable[[], None]] = None
    sessions: Optional[BrowserSessionRepository] = None
    profiles: Optional[CandidateProfileRepository] = None
