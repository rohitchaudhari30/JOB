"""Stage 1: compare the job with the master resume and propose evidence-backed edits."""
import asyncio
import logging
import os
from typing import Any, Dict, List

from app.domain.resume_tailoring.job_text import effective_job_text
from app.domain.resume_tailoring.document import DocumentMap
from app.domain.resume_tailoring.entities import MODE_SUGGESTIONS_ONLY, TailoredResume
from app.domain.resume_tailoring.plan import PlanSchemaError, edit_to_dict, parse_edit_plan
from app.domain.resume_tailoring.rules import ConfirmedFact, find_evidence_block, normalize, phrase_supported, validate_edit
from app.domain.resume_tailoring.status import TailoringStatus
from app.application.resume_tailoring.common import file_format, release_lease, sha256_text, to_facts
from app.application.resume_tailoring.deps import TailoringDeps
from app.application.resume_tailoring.diagnosis import build_nextraise_comparison

logger = logging.getLogger("app.tailoring.analysis")

MAX_QUESTIONS = 8
_FORMAT_REASONS = ("cannot be edited in place", "(format_not_editable)")

SUPPORTED, NEEDS_CONFIRMATION, GAP = "SUPPORTED", "NEEDS_CONFIRMATION", "GAP"


def fail(item: TailoredResume, code: str, message: str) -> TailoredResume:
    item.status = TailoringStatus.FAILED
    item.error_code, item.error_message = code, message
    release_lease(item)
    return item


def stale(item: TailoredResume, message: str) -> TailoredResume:
    item.status = TailoringStatus.STALE
    item.error_code, item.error_message = "STALE", message
    release_lease(item)
    return item


def classify_requirements(
    required: List[str], preferred: List[str], doc: DocumentMap, facts: List[ConfirmedFact], answers: Dict[str, Any]
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    questions = 0
    seen = set()
    for kind, items in (("required", required), ("preferred", preferred)):
        for text in items:
            key = normalize(text)
            if not key or key in seen:
                continue
            seen.add(key)
            entry: Dict[str, Any] = {"id": f"r{len(out) + 1}", "text": text, "kind": kind}
            if phrase_supported(text, doc, []):
                block_id = find_evidence_block(text, doc)
                block = doc.by_id().get(block_id or "")
                entry.update(status=SUPPORTED, source="RESUME", block_id=block_id,
                             snippet=(block.text[:160] if block else ""))
            elif phrase_supported(text, doc, facts):
                entry.update(status=SUPPORTED, source="CONFIRMED_FACT")
            elif answers.get(key, {}).get("has_it") is False:
                entry.update(status=GAP, note="You told us you do not have this.")
            elif kind == "required" and questions < MAX_QUESTIONS:
                questions += 1
                entry.update(status=NEEDS_CONFIRMATION)
            else:
                entry.update(status=GAP, note="Not found in your resume.")
            out.append(entry)
    return out


async def run_analysis(deps: TailoringDeps, item: TailoredResume, max_attempts: int) -> TailoredResume:
    resume = await deps.resumes.get_by_id(item.master_resume_id) if item.master_resume_id else None
    job = await deps.jobs.get_by_id(item.job_id)
    if not resume or resume.user_id != item.user_id:
        return fail(item, "MASTER_UNAVAILABLE", "The master resume is no longer available.")
    if not job:
        return fail(item, "JOB_UNAVAILABLE", "The job is no longer available.")
    if not os.path.isfile(resume.file_path):
        return fail(item, "FILE_MISSING", "The resume file could not be found on the server.")
    if deps.toolkit.file_hash(resume.file_path) != item.master_file_hash:
        return stale(item, "Your resume file changed after this was started. Start again.")
    job_text = effective_job_text(item.job_description_override, job)
    if sha256_text(job_text) != item.job_description_hash:
        return stale(item, "The job description changed after this was started. Start again.")

    fmt = file_format(resume.file_path)
    doc = await asyncio.to_thread(deps.toolkit.build_map, resume.file_path, fmt, resume.raw_text or "")
    if not doc.full_text().strip():
        return fail(item, "NO_READABLE_TEXT", "No readable text was found in this resume.")

    facts = to_facts(await deps.facts.list_for_master(item.user_id, resume.id))
    parsed = job.parsed_requirements or {}
    required = [s for s in (parsed.get("mandatory_skills") or []) if isinstance(s, str)]
    preferred = [s for s in (parsed.get("preferred_skills") or []) if isinstance(s, str)]
    if not required and not preferred:
        required, preferred = await deps.ai.extract_job_requirements(item.user_id, job_text)

    answers = (item.analysis or {}).get("answers", {})
    requirements = classify_requirements(required, preferred, doc, facts, answers)

    previous_error = None
    edits, unreadable, meta = [], [], {}
    for attempt in range(2):
        raw, meta = await deps.ai.propose_edits(
            user_id=item.user_id, job_title=job.title, company=job.company, job_description=job_text,
            requirements=[{"text": r["text"], "kind": r["kind"], "status": r["status"]} for r in requirements],
            document=doc, facts=facts, previous_error=previous_error,
        )
        try:
            edits, unreadable = parse_edit_plan(raw)
            break
        except PlanSchemaError as error:
            previous_error = str(error)
            if attempt == 1:
                return fail(item, "AI_BAD_OUTPUT", "The AI returned an answer we could not use. Please try again.")

    suggestions_only = item.mode == MODE_SUGGESTIONS_ONLY
    job_terms = [r["text"] for r in requirements]
    accepted, rejected, suggestions = [], [], []
    claimed_blocks: set = set()
    for edit in edits:
        reasons = validate_edit(edit, doc, facts, job_terms, suggestions_only=suggestions_only)
        if suggestions_only:
            reasons = [r for r in reasons if not any(marker in r for marker in _FORMAT_REASONS)]
        ids = {edit.block_id} | ({edit.target_block_id} if edit.target_block_id else set())
        if not reasons and ids & claimed_blocks:
            reasons = ["another suggested change already targets the same line"]
        if reasons:
            rejected.append({"id": edit.id, "reasons": reasons, "edit": edit_to_dict(edit)})
            continue
        claimed_blocks |= ids
        (suggestions if suggestions_only else accepted).append(edit_to_dict(edit))
    for bad in unreadable:
        rejected.append({"id": bad.id, "reasons": bad.reasons, "edit": None})

    supported_required = sum(1 for r in requirements if r["kind"] == "required" and r["status"] == SUPPORTED)
    total_required = sum(1 for r in requirements if r["kind"] == "required")
    questions = [
        {"id": r["id"], "requirement": r["text"], "ask": f"Have you really used {r['text']} in a job, project or course?"}
        for r in requirements if r["status"] == NEEDS_CONFIRMATION
    ]
    is_auto = bool((item.analysis or {}).get("auto_generate"))
    profile = await deps.profiles.get_by_user_id(item.user_id) if getattr(deps, 'profiles', None) else None
    nextraise_data = build_nextraise_comparison(
        job_title=job.title,
        job_company=job.company or 'Company',
        job_description=job_text,
        resume_name=resume.file_name or 'Resume',
        requirements=requirements,
        doc=doc,
        raw_text=resume.raw_text or '',
        profile=profile,
        file_path=resume.file_path,
    )
    item.analysis = {
        "auto_generate": is_auto,
        "mode": item.mode,
        "nextraise": nextraise_data,
        "requirements": requirements,
        "questions": questions,
        "gaps": [{"requirement": r["text"], "kind": r["kind"], "note": r.get("note", "")} for r in requirements if r["status"] == GAP],
        "strengths": [r for r in requirements if r["status"] == SUPPORTED],
        "answers": answers,
        "summary": {"required_total": total_required, "required_supported": supported_required},
        "match_note": (
            f"Your resume shows evidence for {supported_required} of {total_required} required skills. "
            "Tailoring only changes wording, so it does not change what you have."
            if total_required else "No required skills could be read from this job."
        ),
        "editable_lines": len(doc.editable_blocks),
        "locked_lines": len(doc.blocks) - len(doc.editable_blocks),
        "layout_check_available": deps.toolkit.renderer_available(),
    }
    item.edit_plan = {"edits": accepted, "suggestions": suggestions, "rejected": rejected}
    item.provider, item.model_name, item.prompt_version = meta.get("provider"), meta.get("model"), meta.get("prompt_version")
    item.error_code = item.error_message = None
    item.attempt_count = 0
    release_lease(item)
    if is_auto and item.mode != MODE_SUGGESTIONS_ONLY and accepted:
        item.approved_edit_ids = [e["id"] for e in accepted]
        item.status = TailoringStatus.GENERATE_QUEUED
    else:
        item.status = TailoringStatus.AWAITING_INPUT
    return item
