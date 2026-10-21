"""Integrity rules: what an edit may and may not do. Pure functions, no I/O.

The resume is the source of truth. An edit is accepted only if all of these hold:
  * it targets a block that is allowed to change and its "before" text is the real current text;
  * it keeps every protected token (email, phone, link, dates) and every number it started with;
  * it introduces no number and no skill-like term that is absent from the resume and from the
    facts the user confirmed;
  * every piece of evidence is a real quote from the cited block, or a fact the user confirmed.
"""
import re
from collections import Counter
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Set

from app.domain.resume_tailoring.document import DocumentMap
from app.domain.resume_tailoring.plan import (
    CATEGORY_CONFIRMED,
    EDIT_REORDER,
    EDIT_REWORD,
    Evidence,
    ProposedEdit,
)

MAX_GROWTH_RATIO = 1.15   # an edited line may be at most 15% longer (plus a small allowance)
MAX_GROWTH_EXTRA = 12
MIN_SHRINK_RATIO = 0.5

_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9+#./_-]*")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_URL = re.compile(r"(?:https?://|www\.)\S+|(?:linkedin|github)\.com\S*", re.IGNORECASE)
_PHONE = re.compile(r"\+?\d[\d\s().-]{8,}\d")
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_MONTH_YEAR = re.compile(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b", re.IGNORECASE)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?%?")

# Short forms people write for the same skill. Both directions are treated as the same term.
ALIASES: Dict[str, str] = {
    "js": "javascript", "ts": "typescript", "k8s": "kubernetes", "postgres": "postgresql",
    "ml": "machine learning", "nlp": "natural language processing", "gcp": "google cloud",
    "aws": "amazon web services", "py": "python", "tf": "tensorflow", "node": "node.js", "nodejs": "node.js",
    "reactjs": "react", "react.js": "react", "vuejs": "vue", "mongo": "mongodb", "ci/cd": "cicd",
}


def normalize(text: str) -> str:
    text = (text or "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip().lower()


def _stem(token: str) -> str:
    token = token.lower().strip(".,;:/-_")
    token = ALIASES.get(token, token)
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        token = token[:-1]
    return token


def token_set(text: str) -> Set[str]:
    return {_stem(t) for t in _WORD.findall(text or "") if _stem(t)}


def protected_tokens(text: str) -> Counter:
    """Things an edit must never add, remove or alter."""
    found: Counter = Counter()
    for pattern, kind in ((_EMAIL, "email"), (_URL, "url"), (_PHONE, "phone"), (_MONTH_YEAR, "monthyear")):
        for m in pattern.finditer(text or ""):
            found[(kind, normalize(m.group(0)))] += 1
    for m in _YEAR.finditer(text or ""):
        found[("year", m.group(0))] += 1
    return found


def numbers(text: str) -> Set[str]:
    return {m.group(0).replace(",", "") for m in _NUMBER.finditer(text or "")}


@dataclass(frozen=True)
class ConfirmedFact:
    id: str
    term: str
    details: str = ""

    @property
    def text(self) -> str:
        return f"{self.term} {self.details}"


def _known_text(doc: DocumentMap, facts: Sequence[ConfirmedFact]) -> str:
    return "\n".join([doc.full_text()] + [f.text for f in facts])


def _is_term_like(raw: str, text: str, start: int) -> bool:
    """Would a reader take this word for a skill, tool or technology name?"""
    if any(c.isdigit() for c in raw) or any(c in raw for c in "+#./"):
        return True
    if len(raw) >= 2 and raw.isupper():
        return True
    if any(c.isupper() for c in raw[1:]):  # camelCase, PostgreSQL
        return True
    if raw[:1].isupper():
        before = text[:start].rstrip()
        return bool(before) and before[-1] not in ".!?:;•-*\n"
    return False


def _contains_phrase(haystack_norm: str, phrase: str) -> bool:
    phrase_norm = normalize(phrase)
    if not phrase_norm:
        return False
    return re.search(r"(?<![\w+#])" + re.escape(phrase_norm) + r"(?![\w+#])", haystack_norm) is not None


def phrase_supported(phrase: str, doc: DocumentMap, facts: Sequence[ConfirmedFact]) -> bool:
    """Is this skill/term really in the resume or among the user's confirmed facts?"""
    known = normalize(_known_text(doc, facts))
    candidates = {normalize(phrase)}
    alias = ALIASES.get(normalize(phrase))
    if alias:
        candidates.add(alias)
    for short, long in ALIASES.items():
        if normalize(phrase) == long:
            candidates.add(short)
    return any(_contains_phrase(known, c) for c in candidates)


def find_evidence_block(phrase: str, doc: DocumentMap) -> Optional[str]:
    """First block that really contains the term (used to show the user why it counts as supported)."""
    candidates = {normalize(phrase)}
    alias = ALIASES.get(normalize(phrase))
    if alias:
        candidates.add(alias)
    for short, long in ALIASES.items():
        if normalize(phrase) == long:
            candidates.add(short)
    for block in doc.blocks:
        norm = normalize(block.text)
        if any(_contains_phrase(norm, c) for c in candidates):
            return block.id
    return None


def _check_evidence(edit: ProposedEdit, doc: DocumentMap, facts: Sequence[ConfirmedFact]) -> List[str]:
    reasons: List[str] = []
    blocks = doc.by_id()
    fact_ids = {f.id for f in facts}
    valid = 0
    for ev in edit.evidence:
        if ev.fact_id:
            if ev.fact_id in fact_ids:
                valid += 1
            else:
                reasons.append(f"evidence cites an unknown confirmed fact '{ev.fact_id}'")
            continue
        block = blocks.get(ev.block_id or "")
        if not block or not ev.quote or len(normalize(ev.quote)) < 4:
            reasons.append("evidence needs a real quote and the block it comes from")
        elif normalize(ev.quote) not in normalize(block.text):
            reasons.append("evidence quote does not appear in the cited resume line")
        else:
            valid += 1
    if valid == 0 and not reasons:
        reasons.append("no evidence given")
    return reasons if valid == 0 else [r for r in reasons if "unknown" in r or "does not appear" in r]


def validate_edit(
    edit: ProposedEdit,
    doc: DocumentMap,
    facts: Sequence[ConfirmedFact] = (),
    job_terms: Iterable[str] = (),
    suggestions_only: bool = False,
) -> List[str]:
    """Returns the reasons the edit must be rejected; an empty list means it is allowed."""
    reasons: List[str] = []
    blocks = doc.by_id()
    block = blocks.get(edit.block_id)
    if block is None:
        return [f"unknown resume line '{edit.block_id}'"]
    if not block.editable:
        reasons.append(f"that line cannot be changed ({block.locked_reason})")
    if suggestions_only:
        reasons.append("this file format cannot be edited in place")

    if edit.type == EDIT_REORDER:
        target = blocks.get(edit.target_block_id or "")
        if target is None:
            reasons.append("reorder needs a valid target line")
        else:
            if not target.editable:
                reasons.append(f"the other line cannot be changed ({target.locked_reason})")
            if edit.block_id == target.id:
                reasons.append("cannot swap a line with itself")
            if block.container != target.container or block.style != target.style:
                reasons.append("lines must be in the same place and style to swap")
            if not block.list_key or block.list_key != target.list_key:
                reasons.append("only lines of the same bullet list can be swapped")
        return reasons

    if edit.type != EDIT_REWORD:
        return reasons + [f"unsupported edit type '{edit.type}'"]

    before, after = block.text, edit.after
    if normalize(edit.before) != normalize(before):
        reasons.append("the 'before' text is not the current text of that line")
    if not after.strip():
        reasons.append("the new text is empty")
        return reasons
    if normalize(after) == normalize(before):
        reasons.append("the new text is the same as the old text")
    if len(after) > len(before) * MAX_GROWTH_RATIO + MAX_GROWTH_EXTRA:
        reasons.append("the new line is too much longer than the original and could change the layout")
    if len(after) < len(before) * MIN_SHRINK_RATIO:
        reasons.append("the new line drops too much of the original content")

    if protected_tokens(before) != protected_tokens(after):
        reasons.append("it changes an email, phone, link or date")
    if not numbers(before) <= numbers(after):
        reasons.append("it removes a number from the original line")

    known = _known_text(doc, facts)
    known_numbers = numbers(known)
    new_numbers = numbers(after) - known_numbers
    if new_numbers:
        reasons.append(f"it adds a number that is not in your resume ({', '.join(sorted(new_numbers))})")

    known_tokens = token_set(known)
    before_tokens = token_set(before)
    for match in _WORD.finditer(after):
        raw = match.group(0).rstrip(".,;:/-_")
        stem = _stem(raw)
        if not stem or stem in known_tokens or stem in before_tokens or _NUMBER.fullmatch(raw):
            continue
        if _is_term_like(raw, after, match.start()):
            reasons.append(f"it adds '{raw}', which is not in your resume or your confirmed facts")
    known_norm = normalize(known)
    after_norm = normalize(after)
    for term in job_terms:
        term_norm = normalize(term)
        if term_norm and _contains_phrase(after_norm, term_norm) and not phrase_supported(term, doc, facts):
            reasons.append(f"it adds the job requirement '{term}', which is not in your resume or your confirmed facts")

    reasons.extend(_check_evidence(edit, doc, facts))
    if edit.category == CATEGORY_CONFIRMED and not any(e.fact_id for e in edit.evidence):
        reasons.append("an addition must cite a fact you confirmed")
    # De-duplicate while keeping order.
    return list(dict.fromkeys(reasons))
