"""Reads a DOCX into a DocumentMap and gives the editor access to the real paragraph elements.

One traversal is shared by text extraction, the AI prompt and the editor, so a block id always
points at the same paragraph.
"""
import re
from typing import Dict, Iterator, List, Optional, Tuple

from docx import Document
from docx.oxml.ns import qn

from app.domain.resume_tailoring.document import (
    CONTAINER_BODY,
    CONTAINER_FOOTER,
    CONTAINER_HEADER,
    CONTAINER_TABLE,
    LOCKED_COMPLEX,
    LOCKED_CONTACT,
    LOCKED_CONTAINER,
    LOCKED_FACTS,
    LOCKED_HEADING,
    LOCKED_SHORT,
    Block,
    DocumentMap,
)

MIN_EDITABLE_CHARS = 12
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?:\+?\d[\d\s().-]{7,}\d)")
_URL = re.compile(r"(?:https?://|www\.|linkedin\.com|github\.com)\S+", re.IGNORECASE)

# Elements inside a paragraph that mean "do not rewrite this line".
_COMPLEX_TAGS = (
    "w:hyperlink", "w:fldSimple", "w:fldChar", "w:instrText", "w:sdt", "w:ins", "w:del", "w:drawing",
    "w:pict", "w:footnoteReference", "w:endnoteReference", "w:tab", "w:br", "w:cr", "w:sym", "w:object",
    "w:bookmarkStart", "w:commentRangeStart", "w:smartTag",
)


def _in_ancestor(element, tags: Tuple[str, ...]) -> bool:
    parent = element.getparent()
    names = {qn(t) for t in tags}
    while parent is not None:
        if parent.tag in names:
            return True
        parent = parent.getparent()
    return False


def _paragraph_text(p) -> str:
    """Visible text of a paragraph, in order, from w:t only (tabs and breaks become a space)."""
    parts: List[str] = []
    for node in p.iter():
        if node.tag == qn("w:t"):
            parts.append(node.text or "")
        elif node.tag in (qn("w:tab"), qn("w:br"), qn("w:cr")):
            parts.append(" ")
    return "".join(parts)


def _is_complex(p) -> bool:
    for tag in _COMPLEX_TAGS:
        if p.find(".//" + qn(tag)) is not None:
            return True
    return False


def _list_key(p) -> Optional[str]:
    num_pr = p.find(qn("w:pPr") + "/" + qn("w:numPr"))
    if num_pr is None:
        return None
    ilvl = num_pr.find(qn("w:ilvl"))
    num_id = num_pr.find(qn("w:numId"))
    return f"{num_id.get(qn('w:val')) if num_id is not None else ''}:{ilvl.get(qn('w:val')) if ilvl is not None else '0'}"


def _is_list_item(p, style: str) -> bool:
    return _list_key(p) is not None or style.lower().startswith("list")


def _looks_like_heading(style: str, text: str) -> bool:
    if style.lower().startswith(("heading", "title")):
        return True
    stripped = text.strip()
    return len(stripped) <= 40 and stripped.upper() == stripped and any(c.isalpha() for c in stripped) and not stripped.endswith(".")


_YEAR_RANGE = re.compile(r"\b(?:19|20)\d{2}\s*[-\u2013\u2014to]+\s*(?:(?:19|20)\d{2}|present|current|now)\b", re.IGNORECASE)
_MONTH_YEAR = re.compile(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b", re.IGNORECASE)


def _has_phone(text: str) -> bool:
    for match in _PHONE.finditer(text):
        candidate = match.group(0)
        if _YEAR_RANGE.search(candidate):
            continue
        if sum(c.isdigit() for c in candidate) >= 10:
            return True
    return False


def _looks_like_contact(text: str) -> bool:
    return bool(_EMAIL.search(text) or _URL.search(text) or _has_phone(text))


def _looks_like_facts_line(text: str, is_list_item: bool) -> bool:
    """Job title / employer / degree lines carry dates; they are facts, not wording."""
    if is_list_item or len(text) > 140:
        return False
    return bool(_YEAR_RANGE.search(text) or _MONTH_YEAR.search(text))


def _walk_part(root, container_for_part: str, prefix: str) -> Iterator[Tuple[str, str, object, bool, bool]]:
    """Yields (block_id, container, paragraph_element, in_fallback, in_textbox) in document order."""
    index = 0
    for p in root.iter(qn("w:p")):
        in_fallback = _has_fallback_ancestor(p)
        in_textbox = _in_ancestor(p, ("w:txbxContent",))
        container = CONTAINER_TABLE if (container_for_part == CONTAINER_BODY and _in_ancestor(p, ("w:tbl",))) else container_for_part
        yield f"{prefix}:{index}", container, p, in_fallback, in_textbox
        index += 1


_MC_FALLBACK = "{http://schemas.openxmlformats.org/markup-compatibility/2006}Fallback"


def _has_fallback_ancestor(element) -> bool:
    parent = element.getparent()
    while parent is not None:
        if parent.tag == _MC_FALLBACK:
            return True
        parent = parent.getparent()
    return False


class DocxStructure:
    """A loaded document plus the id -> paragraph element lookup the editor needs."""

    def __init__(self, path: str):
        self.document = Document(path)
        self.document_map, self.elements = self._build()

    def _parts(self):
        yield CONTAINER_BODY, "body", self.document.element.body
        for si, section in enumerate(self.document.sections):
            for kind, container, hf in (
                ("header", CONTAINER_HEADER, section.header),
                ("footer", CONTAINER_FOOTER, section.footer),
            ):
                if hf is None or hf.is_linked_to_previous:
                    continue
                yield container, f"{kind}{si}", hf._element

    def _build(self) -> Tuple[DocumentMap, Dict[str, object]]:
        blocks: List[Block] = []
        elements: Dict[str, object] = {}
        seen_nonempty = 0
        for container_for_part, prefix, root in self._parts():
            for block_id, container, p, in_fallback, in_textbox in _walk_part(root, container_for_part, prefix):
                if in_fallback:
                    continue  # duplicate copy of a drawing's text; the primary copy is read instead
                text = _paragraph_text(p)
                elements[block_id] = p
                style = _style_of(p, self.document)
                locked = None
                if container in (CONTAINER_HEADER, CONTAINER_FOOTER):
                    locked = LOCKED_CONTAINER
                elif in_textbox or _is_complex(p):
                    locked = LOCKED_COMPLEX
                elif _looks_like_contact(text):
                    locked = LOCKED_CONTACT
                elif _looks_like_heading(style, text):
                    locked = LOCKED_HEADING
                elif _looks_like_facts_line(text, _is_list_item(p, style)):
                    locked = LOCKED_FACTS
                elif text.strip() and seen_nonempty < 2 and len(text.strip()) <= 60 and container == CONTAINER_BODY:
                    locked = LOCKED_CONTACT  # first short lines are normally the name and title block
                elif len(text.strip()) < MIN_EDITABLE_CHARS:
                    locked = LOCKED_SHORT
                if text.strip() and container in (CONTAINER_BODY, CONTAINER_TABLE):
                    seen_nonempty += 1
                blocks.append(
                    Block(
                        id=block_id,
                        container=container,
                        style=style,
                        text=text,
                        locked_reason=locked,
                        list_key=_list_key(p) or (f"style:{style}" if style.lower().startswith("list") else None),
                    )
                )
        return DocumentMap(format="docx", blocks=blocks), elements


def _style_of(p, document) -> str:
    p_style = p.find(qn("w:pPr") + "/" + qn("w:pStyle"))
    if p_style is None:
        return "Normal"
    style_id = p_style.get(qn("w:val"))
    try:
        for style in document.styles:
            if style.style_id == style_id:
                return style.name
    except Exception:
        pass
    return style_id or "Normal"


def build_docx_map(path: str) -> DocumentMap:
    return DocxStructure(path).document_map


def docx_full_text(path: str) -> str:
    """All visible text: body, tables, text boxes, headers and footers, in reading order."""
    return build_docx_map(path).full_text()
