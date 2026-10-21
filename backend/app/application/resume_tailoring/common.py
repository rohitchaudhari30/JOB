import hashlib
import os
import re
from datetime import datetime, timezone
from typing import List, Sequence

from app.domain.resume_tailoring.entities import ConfirmedFactRecord, TailoredResume
from app.domain.resume_tailoring.rules import ConfirmedFact
from app.domain.resume_tailoring.status import TailoringStatus, ensure_transition

SUPPORTED_EXTENSIONS = {".docx": "docx", ".pdf": "pdf"}


def sha256_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def file_format(path: str) -> str:
    return SUPPORTED_EXTENSIONS.get(os.path.splitext(path)[1].lower(), "")


def to_facts(records: Sequence[ConfirmedFactRecord]) -> List[ConfirmedFact]:
    return [ConfirmedFact(id=r.id, term=r.term, details=r.details) for r in records]


def now() -> datetime:
    return datetime.now(timezone.utc)


def move(item: TailoredResume, target: TailoringStatus) -> None:
    ensure_transition(item.status, target)
    item.status = target


def release_lease(item: TailoredResume) -> None:
    item.lease_owner = None
    item.lease_expires_at = None


def slug(text: str, limit: int = 30) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", text or "").strip("-")[:limit] or "job"


def remove_files(*paths) -> None:
    for path in paths:
        if path and os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass
