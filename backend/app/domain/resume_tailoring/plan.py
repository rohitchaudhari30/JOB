"""The structured edit plan the AI proposes, and strict parsing of it.

The model never edits a file. It returns a plan; this module turns untrusted JSON into typed edits
(or says exactly why it could not), and `rules.py` then decides which edits are allowed.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

EDIT_REWORD = "REWORD"
EDIT_REORDER = "REORDER"
EDIT_TYPES = (EDIT_REWORD, EDIT_REORDER)

CATEGORY_SAFE = "A"       # wording of something already in the resume
CATEGORY_CONFIRMED = "B"  # uses a fact the user confirmed

MAX_EDITS = 20
MAX_TEXT = 1200


class PlanSchemaError(ValueError):
    """The whole reply has the wrong shape (not an object, no edits list). Worth one retry."""


@dataclass(frozen=True)
class Evidence:
    quote: Optional[str] = None
    block_id: Optional[str] = None
    fact_id: Optional[str] = None


@dataclass
class ProposedEdit:
    id: str
    type: str
    block_id: str
    before: str = ""
    after: str = ""
    target_block_id: Optional[str] = None
    evidence: List[Evidence] = field(default_factory=list)
    requirement: Optional[str] = None
    reason: str = ""
    category: str = CATEGORY_SAFE


@dataclass
class RejectedEdit:
    id: str
    reasons: List[str]
    edit: Optional[ProposedEdit] = None


def _text(value: Any, limit: int = MAX_TEXT) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def parse_edit_plan(raw: Any) -> Tuple[List[ProposedEdit], List[RejectedEdit]]:
    """Returns (well-formed edits, items that could not even be read). Raises PlanSchemaError for a broken reply."""
    if not isinstance(raw, dict) or not isinstance(raw.get("edits"), list):
        raise PlanSchemaError("The reply must be an object with an 'edits' list.")
    edits: List[ProposedEdit] = []
    rejected: List[RejectedEdit] = []
    seen: set = set()
    for position, item in enumerate(raw["edits"][:MAX_EDITS]):
        edit_id = _text(item.get("id"), 40) if isinstance(item, dict) else ""
        edit_id = edit_id or f"e{position + 1}"
        if edit_id in seen:
            rejected.append(RejectedEdit(edit_id, ["duplicate edit id"]))
            continue
        seen.add(edit_id)
        if not isinstance(item, dict):
            rejected.append(RejectedEdit(edit_id, ["edit is not an object"]))
            continue
        edit_type = _text(item.get("type"), 20).upper()
        block_id = _text(item.get("block_id"), 80)
        if edit_type not in EDIT_TYPES:
            rejected.append(RejectedEdit(edit_id, [f"unsupported edit type '{edit_type or 'missing'}'"]))
            continue
        if not block_id:
            rejected.append(RejectedEdit(edit_id, ["missing block_id"]))
            continue
        evidence: List[Evidence] = []
        raw_evidence = item.get("evidence")
        if isinstance(raw_evidence, list):
            for ev in raw_evidence[:6]:
                if isinstance(ev, dict):
                    evidence.append(
                        Evidence(
                            quote=_text(ev.get("quote"), 400) or None,
                            block_id=_text(ev.get("block_id"), 80) or None,
                            fact_id=_text(ev.get("fact_id"), 80) or None,
                        )
                    )
        category = _text(item.get("category"), 2).upper()
        edits.append(
            ProposedEdit(
                id=edit_id,
                type=edit_type,
                block_id=block_id,
                before=_text(item.get("before")),
                after=_text(item.get("after")),
                target_block_id=_text(item.get("target_block_id"), 80) or None,
                evidence=evidence,
                requirement=_text(item.get("requirement"), 120) or None,
                reason=_text(item.get("reason"), 300),
                category=category if category in (CATEGORY_SAFE, CATEGORY_CONFIRMED) else CATEGORY_SAFE,
            )
        )
    return edits, rejected


def edit_to_dict(edit: ProposedEdit) -> Dict[str, Any]:
    return {
        "id": edit.id,
        "type": edit.type,
        "block_id": edit.block_id,
        "before": edit.before,
        "after": edit.after,
        "target_block_id": edit.target_block_id,
        "evidence": [{"quote": e.quote, "block_id": e.block_id, "fact_id": e.fact_id} for e in edit.evidence],
        "requirement": edit.requirement,
        "reason": edit.reason,
        "category": edit.category,
    }


def edit_from_dict(data: Dict[str, Any]) -> ProposedEdit:
    return ProposedEdit(
        id=data["id"],
        type=data["type"],
        block_id=data["block_id"],
        before=data.get("before", ""),
        after=data.get("after", ""),
        target_block_id=data.get("target_block_id"),
        evidence=[Evidence(e.get("quote"), e.get("block_id"), e.get("fact_id")) for e in data.get("evidence", [])],
        requirement=data.get("requirement"),
        reason=data.get("reason", ""),
        category=data.get("category", CATEGORY_SAFE),
    )
