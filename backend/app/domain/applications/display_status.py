"""Server-owned, user-facing status of an application.

The UI used to guess this from ``workflow_state`` plus substrings of ``failure_reason`` in the
browser, which could disagree with the counts the API returned. One pure function now owns the
mapping; the API returns it as ``display_status`` / ``needs_attention`` and the stats endpoint
counts with the same rule. ``workflow_state`` and ``outcome_status`` are unchanged.
"""

from __future__ import annotations

from typing import Final

from app.domain.applications.entities import WorkflowStateEnum

APPLIED: Final = "Applied"
ALREADY_APPLIED: Final = "Already applied"
COMPANY_SITE: Final = "Company site"
NEEDS_VERIFICATION: Final = "Needs Verification"
FAILED: Final = "Failed"
SKIPPED: Final = "Skipped"
PENDING: Final = "Pending"

DISPLAY_STATUSES: Final = (APPLIED, ALREADY_APPLIED, COMPANY_SITE, NEEDS_VERIFICATION, FAILED, SKIPPED, PENDING)

_RECONCILE_STATES = frozenset({WorkflowStateEnum.RECONCILIATION_REQUIRED, WorkflowStateEnum.SUBMISSION_UNKNOWN})
_PAUSED_STATES = frozenset(s for s in WorkflowStateEnum if s.value.startswith("PAUSED_"))

# States where the user has to do something (or the automation stopped and needs a look).
NEEDS_ATTENTION_STATES: Final = frozenset({WorkflowStateEnum.FAILED}) | _RECONCILE_STATES | _PAUSED_STATES


def needs_attention(workflow_state: WorkflowStateEnum | str) -> bool:
    return WorkflowStateEnum(workflow_state) in NEEDS_ATTENTION_STATES


def derive_display_status(workflow_state: WorkflowStateEnum | str, failure_reason: str | None = None) -> str:
    state = WorkflowStateEnum(workflow_state)
    reason = (failure_reason or "").lower()

    if state == WorkflowStateEnum.APPLIED:
        return APPLIED
    if "already applied" in reason or "already_applied" in reason:
        return ALREADY_APPLIED
    if any(k in reason for k in ("company site", "external", "redirect", "apply on company")):
        return COMPANY_SITE
    if state in _RECONCILE_STATES or "reconciliation_required" in reason or "submission_uncertain" in reason:
        return NEEDS_VERIFICATION
    if state in (WorkflowStateEnum.FAILED, WorkflowStateEnum.REJECTED):
        return FAILED
    if state == WorkflowStateEnum.SKIPPED:
        return SKIPPED
    return PENDING
