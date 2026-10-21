"""A read-only description of a resume document: blocks of text with stable ids.

Pure data, no I/O. The infrastructure layer builds it from a real file; the rules and the AI
prompt work from it, so nothing here depends on how the file is stored.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

# Where a block lives in the file.
CONTAINER_BODY = "body"
CONTAINER_TABLE = "table"
CONTAINER_HEADER = "header"
CONTAINER_FOOTER = "footer"

# Why a block may not be edited.
LOCKED_CONTACT = "contact_or_name"
LOCKED_HEADING = "heading"
LOCKED_FACTS = "employment_or_education_facts"  # title/employer/degree lines with dates
LOCKED_CONTAINER = "header_or_footer"
LOCKED_COMPLEX = "complex_content"  # text boxes, fields, hyperlinks, tracked changes, tabs, breaks
LOCKED_SHORT = "too_short"
LOCKED_FORMAT = "format_not_editable"  # PDF and other formats that cannot be edited in place


@dataclass(frozen=True)
class Block:
    id: str
    container: str
    style: str
    text: str
    locked_reason: Optional[str] = None
    list_key: Optional[str] = None  # same value = same bullet list (numbering id + level)

    @property
    def editable(self) -> bool:
        return self.locked_reason is None


@dataclass
class DocumentMap:
    format: str  # "docx" | "pdf" | "text"
    blocks: List[Block] = field(default_factory=list)

    def by_id(self) -> Dict[str, Block]:
        return {b.id: b for b in self.blocks}

    def full_text(self) -> str:
        return "\n".join(b.text for b in self.blocks if b.text)

    @property
    def editable_blocks(self) -> List[Block]:
        return [b for b in self.blocks if b.editable]
