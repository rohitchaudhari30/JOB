"""Stage 2: apply the approved edits to a copy of the master, validate it, and store it."""
import asyncio
import os
import uuid

from app.domain.resume_tailoring.entities import TailoredResume
from app.domain.resume_tailoring.plan import edit_from_dict
from app.domain.resume_tailoring.rules import validate_edit
from app.domain.resume_tailoring.status import TailoringStatus
from app.application.resume_tailoring.analysis import fail, stale
from app.application.resume_tailoring.common import file_format, release_lease, remove_files, slug, to_facts
from app.application.resume_tailoring.deps import TailoringDeps


async def run_generation(deps: TailoringDeps, item: TailoredResume) -> TailoredResume:
    resume = await deps.resumes.get_by_id(item.master_resume_id) if item.master_resume_id else None
    if not resume or resume.user_id != item.user_id:
        return fail(item, "MASTER_UNAVAILABLE", "The master resume is no longer available.")
    if not os.path.isfile(resume.file_path):
        return fail(item, "FILE_MISSING", "The resume file could not be found on the server.")
    if deps.toolkit.file_hash(resume.file_path) != item.master_file_hash:
        return stale(item, "Your resume file changed after the changes were proposed. Start again.")

    doc = await asyncio.to_thread(deps.toolkit.build_map, resume.file_path, file_format(resume.file_path), resume.raw_text or "")
    facts = to_facts(await deps.facts.list_for_master(item.user_id, resume.id))
    job_terms = [r["text"] for r in (item.analysis or {}).get("requirements", [])]
    approved = set(item.approved_edit_ids or [])
    planned = [edit_from_dict(d) for d in (item.edit_plan or {}).get("edits", []) if d["id"] in approved]

    # The rules run again on the real document right before anything is written.
    edits, dropped = [], []
    for edit in planned:
        reasons = validate_edit(edit, doc, facts, job_terms)
        (dropped.append({"id": edit.id, "reason": "; ".join(reasons)}) if reasons else edits.append(edit))
    if not edits:
        return fail(item, "NO_VALID_EDITS", "None of the approved changes could be applied safely.")

    output_dir = os.path.join(deps.storage_root, "tailored_resumes", item.user_id)
    disk_name = f"{uuid.uuid4().hex}.docx"
    outcome = await asyncio.to_thread(deps.toolkit.generate, resume.file_path, output_dir, disk_name, edits)
    if not outcome.file_path:
        item.validation = {**outcome.validation, "applied": [], "skipped": [{"id": i, "reason": r} for i, r in outcome.skipped]}
        return fail(item, "NO_EDITS_APPLIED", "The approved changes could not be applied to the document.")

    remove_files(item.file_path, item.pdf_file_path)  # a regenerated draft replaces the previous files
    item.file_path, item.pdf_file_path, item.file_hash = outcome.file_path, outcome.pdf_file_path, outcome.file_hash
    stem = os.path.splitext(resume.file_name or "resume")[0]
    item.file_name = f"{slug(stem, 40)}-tailored-{slug(item.company_snapshot or '', 24)}.docx"
    item.validation = {
        **outcome.validation,
        "applied": outcome.applied_ids,
        "skipped": [{"id": i, "reason": r} for i, r in outcome.skipped] + dropped,
    }
    item.error_code = item.error_message = None
    item.attempt_count = 0
    release_lease(item)
    item.status = TailoringStatus.READY_FOR_REVIEW
    return item
