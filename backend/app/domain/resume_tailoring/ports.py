"""What the tailoring use cases need from the outside world."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.domain.resume_tailoring.document import DocumentMap
from app.domain.resume_tailoring.entities import ConfirmedFactRecord, TailoredResume
from app.domain.resume_tailoring.plan import ProposedEdit
from app.domain.resume_tailoring.rules import ConfirmedFact


class TailoredResumeRepository(ABC):
    @abstractmethod
    async def get(self, tailored_id: str) -> Optional[TailoredResume]: ...

    @abstractmethod
    async def create(self, item: TailoredResume) -> TailoredResume:
        """Inserts a new request. Returns the existing unfinished one if a concurrent request created it first."""

    @abstractmethod
    async def save(self, item: TailoredResume) -> TailoredResume: ...

    @abstractmethod
    async def find_in_flight(self, user_id: str, master_resume_id: str, job_id: str) -> Optional[TailoredResume]: ...

    @abstractmethod
    async def find_reusable(self, user_id: str, input_hash: str) -> Optional[TailoredResume]:
        """A READY_FOR_REVIEW or SAVED result made from exactly the same inputs."""

    @abstractmethod
    async def list_for_job(self, user_id: str, job_id: str) -> List[TailoredResume]: ...

    @abstractmethod
    async def count_started_since(self, user_id: str, since: datetime) -> int: ...

    @abstractmethod
    async def list_saved(self, user_id: str) -> List[TailoredResume]: ...

    @abstractmethod
    async def next_version(self, user_id: str, master_resume_id: str, job_id: str) -> int: ...

    @abstractmethod
    async def claim_next(self, worker_id: str, lease_seconds: int) -> Optional[Tuple[TailoredResume, str]]:
        """Atomically leases one piece of work. Returns (item, stage) with stage 'analyze' or 'generate'."""

    @abstractmethod
    async def list_expired_drafts(self, now: datetime, limit: int = 50) -> List[TailoredResume]: ...

    @abstractmethod
    async def count_active_applications_using(self, tailored_id: str) -> int: ...


class ConfirmedFactRepository(ABC):
    @abstractmethod
    async def list_for_master(self, user_id: str, master_resume_id: str) -> List[ConfirmedFactRecord]: ...

    @abstractmethod
    async def upsert(self, user_id: str, master_resume_id: str, term: str, details: str) -> ConfirmedFactRecord: ...


@dataclass
class GenerationOutcome:
    applied_ids: List[str] = field(default_factory=list)
    skipped: List[Tuple[str, str]] = field(default_factory=list)
    validation: Dict[str, Any] = field(default_factory=dict)
    file_path: Optional[str] = None
    pdf_file_path: Optional[str] = None
    file_hash: Optional[str] = None


class DocumentToolkit(ABC):
    """Reads and edits real files. Implemented on top of python-docx and LibreOffice."""

    @abstractmethod
    def build_map(self, path: str, file_format: str, raw_text: str = "") -> DocumentMap: ...

    @abstractmethod
    def file_hash(self, path: str) -> str: ...

    @abstractmethod
    def generate(self, master_path: str, output_dir: str, output_name: str, edits: Sequence[ProposedEdit]) -> GenerationOutcome:
        """Applies the edits to a copy, validates it against the master, and writes the files. Never touches the master."""

    @abstractmethod
    def renderer_available(self) -> bool: ...

    @abstractmethod
    def render_pdf(self, docx_path: str, output_dir: str) -> Optional[str]: ...


class TailoringAI(ABC):
    @abstractmethod
    async def propose_edits(
        self,
        *,
        user_id: str,
        job_title: str,
        company: str,
        job_description: str,
        requirements: List[Dict[str, Any]],
        document: DocumentMap,
        facts: Sequence[ConfirmedFact],
        previous_error: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """Returns (raw plan dict, {'provider': ..., 'model': ..., 'prompt_version': ...})."""

    @abstractmethod
    async def extract_job_requirements(self, user_id: str, job_description: str) -> Tuple[List[str], List[str]]:
        """(required skills, preferred skills) from the job text."""
