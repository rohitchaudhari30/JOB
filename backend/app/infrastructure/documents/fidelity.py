"""Checks a tailored DOCX against its master: structure, wording, protected facts and page layout."""
import os
import tempfile
import zipfile
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from docx import Document
from docx.oxml.ns import qn
from lxml import etree

from app.domain.resume_tailoring.plan import EDIT_REORDER, EDIT_REWORD, ProposedEdit
from app.domain.resume_tailoring.rules import normalize, numbers, protected_tokens
from app.infrastructure.documents.docx_map import DocxStructure
from app.infrastructure.documents.renderer import measure_layout, render_docx_to_pdf, renderer_available

PASS, FAIL, UNAVAILABLE = "pass", "fail", "unavailable"


@dataclass
class Check:
    name: str
    status: str
    detail: str = ""


@dataclass
class ValidationReport:
    checks: List[Check] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(c.status != FAIL for c in self.checks)

    def to_dict(self) -> Dict:
        return {
            "passed": self.passed,
            "checks": [{"name": c.name, "status": c.status, "detail": c.detail} for c in self.checks],
        }


def _c14n(element) -> bytes:
    return etree.tostring(element, method="c14n")


def _paragraph_elements(structure: DocxStructure) -> List:
    return [structure.elements[b.id] for b in structure.document_map.blocks]


def _other_parts_equal(master: str, tailored: str) -> Optional[str]:
    """Every part except the main document must be unchanged (compared as canonical XML)."""
    with zipfile.ZipFile(master) as zm, zipfile.ZipFile(tailored) as zt:
        names_m, names_t = set(zm.namelist()), set(zt.namelist())
        if names_m != names_t:
            return f"file parts differ: {sorted(names_m ^ names_t)[:3]}"
        for name in sorted(names_m):
            if name == "word/document.xml" or name.endswith("/"):
                continue
            a, b = zm.read(name), zt.read(name)
            if a == b:
                continue
            if name.endswith((".xml", ".rels")):
                try:
                    if _c14n(etree.fromstring(a)) == _c14n(etree.fromstring(b)):
                        continue
                except etree.XMLSyntaxError:
                    pass
            if name.startswith("docProps/"):
                continue  # python-docx may touch timestamps/metadata; not part of the visible layout
            return f"part '{name}' changed"
    return None


def _swap_sequence(ids: List[str], edits: Sequence[ProposedEdit]) -> List[str]:
    order = list(ids)
    for e in edits:
        if e.type == EDIT_REORDER and e.target_block_id in order and e.block_id in order:
            i, j = order.index(e.block_id), order.index(e.target_block_id)
            order[i], order[j] = order[j], order[i]
    return order


def validate_tailored_docx(
    master_path: str,
    tailored_path: str,
    applied_edits: Sequence[ProposedEdit],
    work_dir: Optional[str] = None,
) -> ValidationReport:
    report = ValidationReport()
    try:
        master = DocxStructure(master_path)
        tailored = DocxStructure(tailored_path)
    except Exception as error:
        report.checks.append(Check("opens", FAIL, f"The tailored file could not be opened ({type(error).__name__})."))
        return report
    report.checks.append(Check("opens", PASS, "The tailored file opens as a valid Word document."))

    # --- structure -----------------------------------------------------------------------
    ids = [b.id for b in master.document_map.blocks]
    t_ids = [b.id for b in tailored.document_map.blocks]
    problems: List[str] = []
    if len(ids) != len(t_ids):
        problems.append("the number of lines changed")
    else:
        expected_order = _swap_sequence(ids, applied_edits)
        reworded = {e.block_id for e in applied_edits if e.type == EDIT_REWORD}
        for pos, src_id in enumerate(expected_order):
            m_el = master.elements[src_id]
            t_el = tailored.elements[t_ids[pos]]
            if src_id in reworded:
                m_ppr, t_ppr = m_el.find(qn("w:pPr")), t_el.find(qn("w:pPr"))
                same_ppr = (m_ppr is None and t_ppr is None) or (
                    m_ppr is not None and t_ppr is not None and _c14n(m_ppr) == _c14n(t_ppr)
                )
                m_runs, t_runs = m_el.findall(qn("w:r")), t_el.findall(qn("w:r"))
                same_runs = len(m_runs) == len(t_runs) and all(
                    (lambda a, b: (a is None and b is None) or (a is not None and b is not None and _c14n(a) == _c14n(b)))(
                        r1.find(qn("w:rPr")), r2.find(qn("w:rPr"))
                    )
                    for r1, r2 in zip(m_runs, t_runs)
                )
                if not (same_ppr and same_runs):
                    problems.append(f"formatting of line {src_id} changed")
            elif _c14n(m_el) != _c14n(t_el):
                problems.append(f"line {src_id} changed but was not edited")
            if len(problems) >= 3:
                break
    m_body, t_body = master.document.element.body, tailored.document.element.body
    m_sect, t_sect = m_body.find(qn("w:sectPr")), t_body.find(qn("w:sectPr"))
    if (m_sect is None) != (t_sect is None) or (m_sect is not None and _c14n(m_sect) != _c14n(t_sect)):
        problems.append("page setup changed")
    if len(m_body.findall(".//" + qn("w:tbl"))) != len(t_body.findall(".//" + qn("w:tbl"))):
        problems.append("tables changed")
    part_problem = _other_parts_equal(master_path, tailored_path)
    if part_problem:
        problems.append(part_problem)
    if problems:
        report.checks.append(Check("structure", FAIL, "; ".join(problems)))
    else:
        report.checks.append(
            Check("structure", PASS, "Styles, fonts, spacing, page setup, headers, footers and tables are unchanged.")
        )

    # --- wording --------------------------------------------------------------------------
    m_text = {b.id: b.text for b in master.document_map.blocks}
    t_text = {b.id: b.text for b in tailored.document_map.blocks}
    expected_order = _swap_sequence(ids, applied_edits) if len(ids) == len(t_ids) else ids
    wording_problems: List[str] = []
    edits_by_block = {e.block_id: e for e in applied_edits if e.type == EDIT_REWORD}
    if len(ids) == len(t_ids):
        for pos, src_id in enumerate(expected_order):
            got = t_text[t_ids[pos]]
            want = edits_by_block[src_id].after if src_id in edits_by_block else m_text[src_id]
            if got != want:
                wording_problems.append(f"line {src_id} differs from the approved text")
                break
    else:
        wording_problems.append("lines were added or removed")
    if wording_problems:
        report.checks.append(Check("wording", FAIL, "; ".join(wording_problems)))
    else:
        report.checks.append(Check("wording", PASS, f"Only the {len(applied_edits)} approved change(s) differ from your original."))

    # --- protected facts --------------------------------------------------------------------
    m_all = "\n".join(m_text.values())
    t_all = "\n".join(t_text.values())
    if protected_tokens(m_all) != protected_tokens(t_all):
        report.checks.append(Check("protected_facts", FAIL, "An email, phone, link or date differs from the original."))
    elif not numbers(m_all) <= numbers(t_all):
        report.checks.append(Check("protected_facts", FAIL, "A number from the original is missing."))
    else:
        report.checks.append(Check("protected_facts", PASS, "Name, contact details, dates and numbers are all still present."))

    # --- layout -----------------------------------------------------------------------------
    if not renderer_available():
        report.checks.append(
            Check("layout", UNAVAILABLE, "No document renderer is installed, so page layout was not compared.")
        )
        return report
    with tempfile.TemporaryDirectory(prefix="tailor_render_", dir=work_dir) as tmp:
        m_pdf = render_docx_to_pdf(master_path, os.path.join(tmp, "m"))
        t_pdf = render_docx_to_pdf(tailored_path, os.path.join(tmp, "t"))
        m_layout = measure_layout(m_pdf) if m_pdf else None
        t_layout = measure_layout(t_pdf) if t_pdf else None
    if not m_layout or not t_layout:
        report.checks.append(Check("layout", UNAVAILABLE, "The page layout could not be rendered, so it was not compared."))
    elif m_layout.page_count != t_layout.page_count:
        report.checks.append(
            Check("layout", FAIL, f"Page count changed from {m_layout.page_count} to {t_layout.page_count}.")
        )
    elif m_layout.lines_per_page != t_layout.lines_per_page:
        report.checks.append(
            Check(
                "layout",
                FAIL,
                f"Lines per page changed from {m_layout.lines_per_page} to {t_layout.lines_per_page}; text may have reflowed.",
            )
        )
    else:
        report.checks.append(
            Check(
                "layout",
                PASS,
                f"Same page count ({t_layout.page_count}) and same lines per page when rendered with LibreOffice. "
                "Word may lay text out slightly differently.",
            )
        )
    return report
