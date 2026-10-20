"""Contract for the server-owned application status (UX redesign Phase 2)."""
import pytest

from app.application.applications.dtos import ApplicationResponseDTO
from app.domain.applications.display_status import (
    DISPLAY_STATUSES,
    NEEDS_ATTENTION_STATES,
    derive_display_status,
    needs_attention,
)
from app.domain.applications.entities import WorkflowStateEnum


def test_every_workflow_state_maps_to_a_known_status():
    for state in WorkflowStateEnum:
        assert derive_display_status(state) in DISPLAY_STATUSES


@pytest.mark.parametrize(
    "state,expected",
    [
        (WorkflowStateEnum.APPLIED, "Applied"),
        (WorkflowStateEnum.FAILED, "Failed"),
        (WorkflowStateEnum.REJECTED, "Failed"),
        (WorkflowStateEnum.SKIPPED, "Skipped"),
        (WorkflowStateEnum.RECONCILIATION_REQUIRED, "Needs Verification"),
        (WorkflowStateEnum.SUBMISSION_UNKNOWN, "Needs Verification"),
        (WorkflowStateEnum.APPROVAL_REQUIRED, "Pending"),
        (WorkflowStateEnum.PAUSED_OTP, "Pending"),
        (WorkflowStateEnum.DISCOVERED, "Pending"),
    ],
)
def test_state_mapping(state, expected):
    assert derive_display_status(state) == expected


@pytest.mark.parametrize(
    "reason,expected",
    [
        ("Already applied on the portal", "Already applied"),
        ("redirected to company site", "Company site"),
        ("External apply link", "Company site"),
        ("submission_uncertain: no confirmation", "Needs Verification"),
    ],
)
def test_failure_reason_refines_status(reason, expected):
    assert derive_display_status(WorkflowStateEnum.FAILED, reason) == expected


def test_applied_state_wins_over_reason_text():
    assert derive_display_status(WorkflowStateEnum.APPLIED, "external redirect") == "Applied"


def test_needs_attention_set_is_failed_unverified_and_every_pause():
    expected = {s for s in WorkflowStateEnum if s.value.startswith("PAUSED_")} | {
        WorkflowStateEnum.FAILED,
        WorkflowStateEnum.RECONCILIATION_REQUIRED,
        WorkflowStateEnum.SUBMISSION_UNKNOWN,
    }
    assert set(NEEDS_ATTENTION_STATES) == expected
    assert needs_attention(WorkflowStateEnum.PAUSED_AUTH_EXPIRED) is True
    assert needs_attention(WorkflowStateEnum.PAUSED_SESSION) is True
    assert needs_attention(WorkflowStateEnum.APPLIED) is False
    assert needs_attention("APPROVAL_REQUIRED") is False


def test_dto_serialises_server_fields_and_keeps_existing_ones():
    dto = ApplicationResponseDTO(
        id="a", user_id="u", job_id="j", idempotency_key="k",
        workflow_state=WorkflowStateEnum.SUBMISSION_UNKNOWN,
    )
    data = dto.model_dump(mode="json")
    assert data["display_status"] == "Needs Verification"
    assert data["needs_attention"] is True
    assert data["workflow_state"] == "SUBMISSION_UNKNOWN"
