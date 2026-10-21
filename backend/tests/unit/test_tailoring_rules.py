import pytest

from app.domain.resume_tailoring.plan import (
    CATEGORY_CONFIRMED, Evidence, PlanSchemaError, ProposedEdit, parse_edit_plan,
)
from app.domain.resume_tailoring.rules import ConfirmedFact, find_evidence_block, phrase_supported, validate_edit
from app.domain.resume_tailoring.status import InvalidTransition, TailoringStatus, ensure_transition
from app.infrastructure.documents.docx_map import build_docx_map
from tests.support.resume_docs import make_resume


@pytest.fixture
def doc(tmp_path):
    return build_docx_map(str(make_resume(tmp_path / "r.docx")))


def _block(doc, start):
    return next(b for b in doc.blocks if b.text.startswith(start))


def _reword(doc, after, evidence=None, start="Built Python", **kw):
    b = _block(doc, start)
    return ProposedEdit(
        id="e1", type="REWORD", block_id=b.id, before=b.text, after=after,
        evidence=evidence if evidence is not None else [Evidence(quote="Python data pipelines", block_id=b.id)], **kw,
    )


GOOD = "Built scalable Python data pipelines that load daily reports into PostgreSQL."


def test_a_supported_reword_is_allowed(doc):
    assert validate_edit(_reword(doc, GOOD), doc, job_terms=["Python"]) == []


def test_skill_only_in_the_job_description_is_rejected(doc):
    reasons = validate_edit(_reword(doc, "Built Python and Kubernetes data pipelines that load daily reports into PostgreSQL."), doc, job_terms=["Kubernetes"])
    assert any("Kubernetes" in r for r in reasons)


def test_lowercase_job_term_is_still_rejected(doc):
    reasons = validate_edit(_reword(doc, "Built Python data pipelines on kubernetes that load daily reports into PostgreSQL."), doc, job_terms=["kubernetes"])
    assert reasons


def test_invented_number_is_rejected(doc):
    reasons = validate_edit(_reword(doc, "Built Python data pipelines that load daily reports into PostgreSQL for 50 clients."), doc)
    assert any("number" in r for r in reasons)


def test_dropping_an_existing_number_is_rejected(doc):
    b = _block(doc, "Reduced report")
    edit = ProposedEdit("e1", "REWORD", b.id, b.text, "Reduced report generation time by caching results in Redis.",
                        evidence=[Evidence(quote="caching results in Redis", block_id=b.id)])
    assert any("removes a number" in r for r in validate_edit(edit, doc))


def test_locked_lines_cannot_be_edited(doc):
    for start in ("Senior Engineer", "Asha Verma", "asha.verma@"):
        b = _block(doc, start)
        edit = ProposedEdit("e1", "REWORD", b.id, b.text, b.text + " extra", evidence=[Evidence(quote=b.text[:10], block_id=b.id)])
        assert any("cannot be changed" in r for r in validate_edit(edit, doc))


def test_stale_before_text_is_rejected(doc):
    b = _block(doc, "Built Python")
    edit = ProposedEdit("e1", "REWORD", b.id, "something else entirely", GOOD, evidence=[Evidence(quote="Python data", block_id=b.id)])
    assert any("current text" in r for r in validate_edit(edit, doc))


def test_evidence_must_be_a_real_quote(doc):
    assert any("no evidence" in r for r in validate_edit(_reword(doc, GOOD, evidence=[]), doc))
    b = _block(doc, "Built Python")
    fake = [Evidence(quote="Terraform and Kubernetes", block_id=b.id)]
    assert any("does not appear" in r for r in validate_edit(_reword(doc, GOOD, evidence=fake), doc))


def test_overlong_line_is_rejected(doc):
    long_after = GOOD + " " + "Also worked on many things across teams and systems every week. " * 3
    assert any("longer" in r for r in validate_edit(_reword(doc, long_after), doc))


def test_confirmed_fact_allows_the_skill_but_only_with_the_fact_as_evidence(doc):
    fact = ConfirmedFact(id="f1", term="Kubernetes", details="Ran our services on Kubernetes at Northwind for two years")
    after = "Built Python data pipelines on Kubernetes that load daily reports into PostgreSQL."
    ok = _reword(doc, after, evidence=[Evidence(fact_id="f1")], category=CATEGORY_CONFIRMED)
    assert validate_edit(ok, doc, facts=[fact], job_terms=["Kubernetes"]) == []
    no_fact = _reword(doc, after, evidence=[Evidence(fact_id="f1")], category=CATEGORY_CONFIRMED)
    assert validate_edit(no_fact, doc, facts=[], job_terms=["Kubernetes"])  # fact unknown -> rejected


def test_reorder_only_within_the_same_bullet_list(doc):
    a, b = _block(doc, "Built Python"), _block(doc, "Reduced report")
    ok = ProposedEdit("r1", "REORDER", a.id, target_block_id=b.id)
    assert validate_edit(ok, doc) == []
    skills = _block(doc, "Languages")
    bad = ProposedEdit("r2", "REORDER", a.id, target_block_id=skills.id)
    assert validate_edit(bad, doc)


def test_pdf_style_documents_only_get_suggestions(doc):
    assert any("cannot be edited in place" in r for r in validate_edit(_reword(doc, GOOD), doc, suggestions_only=True))


def test_support_check_uses_the_resume_not_the_model(doc):
    assert phrase_supported("Python", doc, [])
    assert phrase_supported("postgres", doc, [])  # alias of PostgreSQL
    assert not phrase_supported("Terraform", doc, [])
    assert find_evidence_block("Redis", doc) is not None
    assert find_evidence_block("Terraform", doc) is None


def test_plan_parser_is_strict_but_keeps_good_items():
    edits, rejected = parse_edit_plan({"edits": [
        {"id": "a", "type": "reword", "block_id": "body:1", "after": "x"},
        {"id": "b", "type": "ADD_BLOCK", "block_id": "body:1"},
        "not an object",
    ]})
    assert [e.id for e in edits] == ["a"] and len(rejected) == 2
    for bad in (None, [], {"edits": "no"}, {"nothing": 1}):
        with pytest.raises(PlanSchemaError):
            parse_edit_plan(bad)


def test_status_machine():
    ensure_transition(TailoringStatus.QUEUED, TailoringStatus.ANALYZING)
    with pytest.raises(InvalidTransition):
        ensure_transition(TailoringStatus.SAVED, TailoringStatus.GENERATING)
    with pytest.raises(InvalidTransition):
        ensure_transition(TailoringStatus.FAILED, TailoringStatus.QUEUED)
