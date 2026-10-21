"""Applies approved edits to a COPY of a DOCX, touching as little as possible.

Rewording keeps the original runs: only the characters that change are replaced, and they take the
formatting of the run they sit in, so fonts, sizes, bold and spacing stay as they were. Anything that
cannot be done faithfully is skipped and reported, never forced.
"""
import copy
import difflib
import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Sequence, Tuple

from docx.oxml.ns import qn

from app.domain.resume_tailoring.plan import EDIT_REORDER, EDIT_REWORD, ProposedEdit
from app.infrastructure.documents.docx_map import DocxStructure

_TOKEN = re.compile(r"\s+|\w+|[^\w\s]", re.UNICODE)
_XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
_PLAIN_RUN_CHILDREN = {qn("w:rPr"), qn("w:t")}


@dataclass
class ApplyResult:
    applied: List[str] = field(default_factory=list)
    skipped: List[Tuple[str, str]] = field(default_factory=list)  # (edit id, reason)


def _run_text(run) -> str:
    return "".join(t.text or "" for t in run.findall(qn("w:t")))


def _set_run_text(run, text: str) -> None:
    texts = run.findall(qn("w:t"))
    if texts:
        first = texts[0]
        for extra in texts[1:]:
            run.remove(extra)
    else:
        first = run.makeelement(qn("w:t"), {})
        run.append(first)
    first.text = text
    first.set(_XML_SPACE, "preserve")


def _plain_runs(p):
    """The paragraph's own runs, or None if it holds anything this editor does not handle."""
    for child in p:
        if child.tag not in (qn("w:pPr"), qn("w:r"), qn("w:proofErr"), qn("w:bookmarkStart"), qn("w:bookmarkEnd")):
            return None
    runs = p.findall(qn("w:r"))
    for run in runs:
        if any(c.tag not in _PLAIN_RUN_CHILDREN for c in run):
            return None
    return runs


def _tokens_with_offsets(text: str) -> List[Tuple[str, int]]:
    out, pos = [], 0
    for m in _TOKEN.finditer(text):
        out.append((m.group(0), pos))
        pos += len(m.group(0))
    return out


def reword_paragraph(p, before: str, after: str) -> None:
    """Changes the paragraph text from `before` to `after` run by run. Raises ValueError if it cannot."""
    runs = _plain_runs(p)
    if runs is None:
        raise ValueError("the line has content that cannot be edited safely")
    texts = [_run_text(r) for r in runs]
    if "".join(texts) != before:
        raise ValueError("the line no longer matches the text the plan was made from")
    if not runs:
        raise ValueError("the line has no text runs")

    a = [t for t, _ in _tokens_with_offsets(before)]
    b = [t for t, _ in _tokens_with_offsets(after)]
    offsets_a = [o for _, o in _tokens_with_offsets(before)] + [len(before)]
    matcher = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    ops = [op for op in matcher.get_opcodes() if op[0] != "equal"]

    starts = []
    cursor = 0
    for t in texts:
        starts.append(cursor)
        cursor += len(t)

    for tag, i1, i2, j1, j2 in reversed(ops):
        start, end = offsets_a[i1], offsets_a[i2]
        replacement = "".join(b[j1:j2])
        if start == end:  # pure insertion: take the formatting of the run the position falls in
            target = 0
            for idx, s in enumerate(starts):
                if s < start <= s + len(texts[idx]) or (start == 0 and idx == 0):
                    target = idx
                    break
            else:
                target = len(texts) - 1
            offset = start - starts[target]
            texts[target] = texts[target][:offset] + replacement + texts[target][offset:]
            continue
        placed = False
        for idx, s in enumerate(starts):
            run_start, run_end = s, s + len(texts[idx])
            lo, hi = max(start, run_start), min(end, run_end)
            if lo >= hi:
                continue
            local_lo, local_hi = lo - s, hi - s
            if not placed:
                texts[idx] = texts[idx][:local_lo] + replacement + texts[idx][local_hi:]
                placed = True
            else:
                texts[idx] = texts[idx][:local_lo] + texts[idx][local_hi:]
        if not placed:
            raise ValueError("could not locate the text to replace")
        # Edits go from the end of the line backwards, so offsets before this point are still valid;
        # run start positions after it have moved and are recomputed.
        starts = []
        cursor = 0
        for t in texts:
            starts.append(cursor)
            cursor += len(t)

    if "".join(texts) != after:
        raise ValueError("the edited line did not match the intended text")
    for run, text in zip(runs, texts):
        if text != _run_text(run):
            _set_run_text(run, text)


def _swap(p1, p2) -> None:
    parent = p1.getparent()
    if parent is None or p2.getparent() is not parent:
        raise ValueError("lines are not in the same place")
    i1, i2 = parent.index(p1), parent.index(p2)
    if i1 > i2:
        p1, p2, i1, i2 = p2, p1, i2, i1
    parent.remove(p2)
    parent.remove(p1)
    parent.insert(i1, p2)
    parent.insert(i2, p1)


def apply_edits(master_path: str, output_path: str, edits: Sequence[ProposedEdit]) -> ApplyResult:
    """Writes a tailored copy to `output_path`. The master file is only ever read."""
    structure = DocxStructure(master_path)
    blocks = structure.document_map.by_id()
    elements: Dict[str, object] = structure.elements
    result = ApplyResult()
    touched: set = set()

    # Rewording first (while ids still point at the same elements), then swaps.
    ordered = sorted(edits, key=lambda e: 0 if e.type == EDIT_REWORD else 1)
    for edit in ordered:
        ids = {edit.block_id} | ({edit.target_block_id} if edit.target_block_id else set())
        if ids & touched:
            result.skipped.append((edit.id, "another edit already changes the same line"))
            continue
        try:
            if edit.type == EDIT_REWORD:
                block = blocks[edit.block_id]
                reword_paragraph(elements[edit.block_id], block.text, edit.after)
            elif edit.type == EDIT_REORDER:
                _swap(elements[edit.block_id], elements[edit.target_block_id])
            else:
                raise ValueError("unsupported edit type")
        except (ValueError, KeyError) as error:
            result.skipped.append((edit.id, str(error)))
            continue
        touched |= ids
        result.applied.append(edit.id)

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    structure.document.save(output_path)
    return result
