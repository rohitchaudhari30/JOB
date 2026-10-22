"""The use cases the API calls. Every method checks that the request belongs to the signed-in user."""
import os
import uuid
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.core.exceptions import ConflictException, EntityNotFoundException, PlatformException, ValidationException
from app.domain.resume_tailoring.entities import MODE_EDIT, MODE_SUGGESTIONS_ONLY, TailoredResume
from app.domain.resume_tailoring.plan import PROMPT_VERSION
from app.domain.resume_tailoring.rules import normalize
from app.domain.resume_tailoring.status import IN_FLIGHT, TailoringStatus
from app.application.resume_tailoring.analysis import GAP, NEEDS_CONFIRMATION, SUPPORTED
from app.application.resume_tailoring.common import (
    file_format, move, now, release_lease, remove_files, sha256_text,
)
from app.application.resume_tailoring.deps import TailoringDeps

MIN_DETAIL_CHARS = 10
MAX_DETAIL_CHARS = 500
_CANCELLABLE = {
    TailoringStatus.QUEUED, TailoringStatus.ANALYZING, TailoringStatus.AWAITING_INPUT,
    TailoringStatus.GENERATE_QUEUED, TailoringStatus.GENERATING,
}


def _problem(message: str, code: str) -> ValidationException:
    return ValidationException(message, details={"code": code})


class TailoringService:
    def __init__(self, deps: TailoringDeps):
        self._d = deps

    # ---- helpers -------------------------------------------------------------------------
    async def _owned(self, user_id: str, tailored_id: str) -> TailoredResume:
        item = await self._d.tailored.get(tailored_id)
        if item is None or item.user_id != user_id:
            raise EntityNotFoundException("Tailored resume", tailored_id)  # same answer for "not yours"
        return item

    def _poke(self) -> None:
        if self._d.on_work_queued:
            self._d.on_work_queued()

    # ---- start ---------------------------------------------------------------------------
    async def start(self, user_id: str, job_id: str, master_resume_id: Optional[str]) -> TailoredResume:
        job = await self._d.jobs.get_by_id(job_id)
        if job is None:
            raise EntityNotFoundException("Job", job_id)
        if len((job.raw_description or "").strip()) < settings.TAILORING_MIN_JOB_DESCRIPTION_CHARS:
            raise _problem("This job has no usable description to tailor against. Open the posting for details.", "JOB_DESCRIPTION_TOO_SHORT")

        if master_resume_id:
            resume = await self._d.resumes.get_by_id(master_resume_id)
            if resume is None or resume.user_id != user_id:
                raise EntityNotFoundException("Resume", master_resume_id)
        else:
            resumes = await self._d.resumes.list_by_user_id(user_id)
            if not resumes:
                raise _problem("Upload a resume first.", "NO_RESUME")
            resume = next((r for r in resumes if r.is_default), resumes[0])

        fmt = file_format(resume.file_path)
        if not fmt:
            raise _problem("Only Word (.docx) and PDF resumes can be used.", "UNSUPPORTED_FORMAT")
        if not os.path.isfile(resume.file_path):
            raise _problem("The resume file could not be found on the server.", "FILE_MISSING")
        if fmt == "pdf" and not (resume.raw_text or "").strip():
            raise _problem("This PDF has no readable text (it may be a scan). Upload a Word version.", "NO_READABLE_TEXT")

        file_hash = self._d.toolkit.file_hash(resume.file_path)
        job_hash = sha256_text(job.raw_description)
        input_hash = sha256_text(f"{user_id}|{file_hash}|{job_id}|{job_hash}|{PROMPT_VERSION}")

        in_flight = await self._d.tailored.find_in_flight(user_id, resume.id, job_id)
        if in_flight:
            return in_flight
        reusable = await self._d.tailored.find_reusable(user_id, input_hash)
        if reusable:
            return reusable

        limit = settings.TAILORING_MAX_STARTS_PER_DAY
        if limit > 0 and await self._d.tailored.count_started_since(user_id, now() - timedelta(hours=24)) >= limit:
            raise PlatformException(
                f"You have reached today's limit of {limit} tailoring requests. Try again tomorrow.",
                status_code=429,
                details={"code": "DAILY_LIMIT", "limit": limit},
            )

        stamp = now()
        item = TailoredResume(
            id=str(uuid.uuid4()), user_id=user_id, master_resume_id=resume.id, master_file_hash=file_hash,
            job_id=job_id, job_description_hash=job_hash, input_hash=input_hash,
            mode=MODE_EDIT if fmt == "docx" else MODE_SUGGESTIONS_ONLY,
            version=await self._d.tailored.next_version(user_id, resume.id, job_id),
            master_label_snapshot=resume.label, job_title_snapshot=job.title, company_snapshot=job.company,
            prompt_version=PROMPT_VERSION, created_at=stamp, updated_at=stamp,
            expires_at=stamp + timedelta(days=settings.TAILORING_DRAFT_RETENTION_DAYS),
        )
        created = await self._d.tailored.create(item)
        self._poke()
        return created

    # ---- read ----------------------------------------------------------------------------
    async def get(self, user_id: str, tailored_id: str) -> TailoredResume:
        return await self._owned(user_id, tailored_id)

    async def list_for_job(self, user_id: str, job_id: str) -> List[TailoredResume]:
        return await self._d.tailored.list_for_job(user_id, job_id)

    async def list_saved(self, user_id: str) -> List[TailoredResume]:
        return await self._d.tailored.list_saved(user_id)

    # ---- answers -------------------------------------------------------------------------
    async def answer(self, user_id: str, tailored_id: str, answers: List[Dict[str, Any]]) -> TailoredResume:
        item = await self._owned(user_id, tailored_id)
        if item.status != TailoringStatus.AWAITING_INPUT or not item.analysis:
            raise ConflictException("Questions can only be answered while the analysis is waiting for you.")
        by_id = {r["id"]: r for r in item.analysis.get("requirements", [])}
        recorded = dict(item.analysis.get("answers", {}))
        any_yes = False
        for ans in answers:
            req = by_id.get(str(ans.get("question_id")))
            if not req or req["status"] != NEEDS_CONFIRMATION:
                raise _problem("That question is not open.", "UNKNOWN_QUESTION")
            if ans.get("has_it"):
                details = str(ans.get("details") or "").strip()
                if len(details) < MIN_DETAIL_CHARS:
                    raise _problem(f"Tell us briefly where and how you used {req['text']} (at least {MIN_DETAIL_CHARS} characters).", "DETAILS_REQUIRED")
                await self._d.facts.upsert(user_id, item.master_resume_id, req["text"], details[:MAX_DETAIL_CHARS])
                recorded[normalize(req["text"])] = {"has_it": True}
                any_yes = True
            else:
                recorded[normalize(req["text"])] = {"has_it": False}
        analysis = dict(item.analysis)
        analysis["answers"] = recorded
        item.analysis = analysis
        if any_yes:
            move(item, TailoringStatus.QUEUED)  # plan again with the confirmed facts
            item.attempt_count = 0
        else:
            # Only "no" answers: those requirements become honest gaps, nothing to re-plan.
            reqs = []
            for r in analysis["requirements"]:
                if r["status"] == NEEDS_CONFIRMATION and recorded.get(normalize(r["text"]), {}).get("has_it") is False:
                    r = {**r, "status": GAP, "note": "You told us you do not have this."}
                reqs.append(r)
            analysis["requirements"] = reqs
            analysis["questions"] = [q for q in analysis["questions"] if recorded.get(normalize(q["requirement"]), {}).get("has_it") is None]
            analysis["gaps"] = [{"requirement": r["text"], "kind": r["kind"], "note": r.get("note", "")} for r in reqs if r["status"] == GAP]
            item.analysis = analysis
        saved = await self._d.tailored.save(item)
        if any_yes:
            self._poke()
        return saved

    # ---- generate / save / discard ---------------------------------------------------------
    async def generate(self, user_id: str, tailored_id: str, approved_edit_ids: List[str]) -> TailoredResume:
        item = await self._owned(user_id, tailored_id)
        if item.mode != MODE_EDIT:
            raise _problem("This file format cannot be edited. Only suggestions are available.", "SUGGESTIONS_ONLY")
        if item.status not in (TailoringStatus.AWAITING_INPUT, TailoringStatus.READY_FOR_REVIEW):
            raise ConflictException("Changes can only be approved after the analysis is ready.")
        accepted = {e["id"] for e in (item.edit_plan or {}).get("edits", [])}
        chosen = list(dict.fromkeys(approved_edit_ids))
        if not chosen:
            raise _problem("Choose at least one change to apply.", "NO_EDITS_SELECTED")
        unknown = [i for i in chosen if i not in accepted]
        if unknown:
            raise _problem("Some selected changes are not part of this plan.", "UNKNOWN_EDITS")
        item.approved_edit_ids = chosen
        item.attempt_count = 0
        move(item, TailoringStatus.GENERATE_QUEUED)
        saved = await self._d.tailored.save(item)
        self._poke()
        return saved

    async def _still_current(self, item: TailoredResume) -> Optional[str]:
        resume = await self._d.resumes.get_by_id(item.master_resume_id) if item.master_resume_id else None
        if resume is None or not os.path.isfile(resume.file_path):
            return "The master resume is no longer available."
        if self._d.toolkit.file_hash(resume.file_path) != item.master_file_hash:
            return "Your resume file changed after this copy was made."
        job = await self._d.jobs.get_by_id(item.job_id)
        if job is not None and sha256_text(job.raw_description) != item.job_description_hash:
            return "The job description changed after this copy was made."
        return None

    async def save(self, user_id: str, tailored_id: str) -> TailoredResume:
        item = await self._owned(user_id, tailored_id)
        if item.status != TailoringStatus.READY_FOR_REVIEW:
            raise ConflictException("Only a copy that is ready for review can be saved.")
        if not (item.validation or {}).get("passed") or not item.file_path or not os.path.isfile(item.file_path):
            raise _problem("This copy did not pass the checks, so it cannot be saved. Regenerate with fewer changes.", "VALIDATION_FAILED")
        problem = await self._still_current(item)
        if problem:
            item.status = TailoringStatus.STALE
            item.error_code, item.error_message = "STALE", problem
            await self._d.tailored.save(item)
            raise ConflictException(problem + " Start again.")
        move(item, TailoringStatus.SAVED)
        item.approved_at = now()
        item.expires_at = None
        return await self._d.tailored.save(item)

    async def discard(self, user_id: str, tailored_id: str) -> None:
        item = await self._owned(user_id, tailored_id)
        if item.status in (TailoringStatus.DISCARDED, TailoringStatus.CANCELLED):
            return
        if await self._d.tailored.count_active_applications_using(item.id):
            raise ConflictException("This copy is attached to an application that is still in progress.")
        await self._drop(item, TailoringStatus.DISCARDED)

    async def cancel(self, user_id: str, tailored_id: str) -> TailoredResume:
        item = await self._owned(user_id, tailored_id)
        if item.status not in _CANCELLABLE:
            raise ConflictException("Only work that has not finished can be cancelled.")
        return await self._drop(item, TailoringStatus.CANCELLED)

    async def _drop(self, item: TailoredResume, target: TailoringStatus) -> TailoredResume:
        remove_files(item.file_path, item.pdf_file_path)
        item.status = target
        item.file_path = item.pdf_file_path = None
        release_lease(item)
        return await self._d.tailored.save(item)

    # ---- download ------------------------------------------------------------------------
    async def download(self, user_id: str, tailored_id: str, fmt: str = "docx") -> Tuple[str, str, str]:
        item = await self._owned(user_id, tailored_id)
        usable = item.status == TailoringStatus.SAVED or (
            item.status == TailoringStatus.READY_FOR_REVIEW and (item.validation or {}).get("passed")
        )
        if not usable:
            raise ConflictException("Only a copy that passed the checks can be downloaded.")
        if fmt == "pdf":
            path, media = item.pdf_file_path, "application/pdf"
            name = (item.file_name or "resume.docx").rsplit(".", 1)[0] + ".pdf"
        else:
            path = item.file_path
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            name = item.file_name or "resume.docx"
        if not path or not os.path.isfile(path):
            raise EntityNotFoundException("Tailored resume file", tailored_id)
        return path, name, media

    # ---- housekeeping --------------------------------------------------------------------
    async def expire_drafts(self) -> int:
        removed = 0
        for item in await self._d.tailored.list_expired_drafts(now()):
            if item.status in IN_FLIGHT or item.status in (TailoringStatus.FAILED, TailoringStatus.CANCELLED, TailoringStatus.STALE):
                await self._drop(item, TailoringStatus.DISCARDED)
                removed += 1
        return removed
