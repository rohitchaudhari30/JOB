import hashlib

from docx import Document
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

from app.domain.resume_tailoring.document import LOCKED_COMPLEX, LOCKED_CONTACT, LOCKED_CONTAINER, LOCKED_FACTS, LOCKED_HEADING
from app.infrastructure.documents.docx_map import build_docx_map
from app.infrastructure.resume_text import extract_resume_text
from tests.support.resume_docs import make_resume


def _by_text(doc_map, start):
    return next(b for b in doc_map.blocks if b.text.startswith(start))


def test_text_extraction_now_includes_tables_and_headers(tmp_path):
    path = make_resume(tmp_path / "r.docx", table_skills=True, header_text="Asha Verma - Confidential CV")
    text = extract_resume_text(str(path))
    assert "Bash scripting" in text          # table cell
    assert "Confidential CV" in text         # header
    assert "PostgreSQL" in text              # normal paragraph still works


def test_blocks_are_locked_for_names_contacts_headings_facts_and_headers(tmp_path):
    path = make_resume(tmp_path / "r.docx", header_text="Asha Verma - Resume")
    doc_map = build_docx_map(str(path))
    assert _by_text(doc_map, "Asha Verma").locked_reason == LOCKED_CONTACT
    assert _by_text(doc_map, "asha.verma@").locked_reason == LOCKED_CONTACT
    assert _by_text(doc_map, "Summary").locked_reason == LOCKED_HEADING
    assert _by_text(doc_map, "Senior Engineer").locked_reason == LOCKED_FACTS
    assert _by_text(doc_map, "B.E. Computer").locked_reason == LOCKED_FACTS
    header = next(b for b in doc_map.blocks if b.container == "header")
    assert header.locked_reason == LOCKED_CONTAINER
    bullet = _by_text(doc_map, "Built Python")
    assert bullet.editable and bullet.list_key == "style:List Bullet"


def test_text_boxes_are_detected_and_locked(tmp_path):
    path = make_resume(tmp_path / "r.docx")
    doc = Document(str(path))
    box = parse_xml(
        f'<w:p {nsdecls("w")}><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>Hidden skills in a text box here</w:t></w:r></w:p>'
        f"</w:txbxContent></w:pict></w:r></w:p>"
    )
    doc.element.body.insert(0, box)
    doc.save(str(path))
    doc_map = build_docx_map(str(path))
    boxed = _by_text(doc_map, "Hidden skills")
    assert boxed.locked_reason == LOCKED_COMPLEX


def test_building_the_map_never_changes_the_file(tmp_path):
    path = make_resume(tmp_path / "r.docx")
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    build_docx_map(str(path))
    assert hashlib.sha256(path.read_bytes()).hexdigest() == before
