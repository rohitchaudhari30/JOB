import pytest
from app.core.exceptions import InvalidStateTransitionException
from app.domain.applications.entities import WorkflowStateEnum


class ApplicationStateMachine:
    """Domain service managing state transitions with validation guards."""
    VALID_TRANSITIONS = {
        WorkflowStateEnum.DISCOVERED: {
            WorkflowStateEnum.MATCHING,
            WorkflowStateEnum.EXPIRED,
            WorkflowStateEnum.SKIPPED,
        },
        WorkflowStateEnum.MATCHING: {
            WorkflowStateEnum.MATCHED,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.MATCHED: {
            WorkflowStateEnum.SHORTLISTED,
            WorkflowStateEnum.APPROVAL_REQUIRED,
            WorkflowStateEnum.APPROVED,
            WorkflowStateEnum.REJECTED,
            WorkflowStateEnum.SKIPPED,
        },
        WorkflowStateEnum.SHORTLISTED: {
            WorkflowStateEnum.APPROVED,
            WorkflowStateEnum.APPROVAL_REQUIRED,
            WorkflowStateEnum.REJECTED,
            WorkflowStateEnum.SKIPPED,
        },
        WorkflowStateEnum.APPROVAL_REQUIRED: {
            WorkflowStateEnum.APPROVED,
            WorkflowStateEnum.REJECTED,
            WorkflowStateEnum.SKIPPED,
        },
        WorkflowStateEnum.APPROVED: {
            WorkflowStateEnum.APPLYING,
            WorkflowStateEnum.SKIPPED,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.APPLYING: {
            WorkflowStateEnum.FORM_DETECTED,
            WorkflowStateEnum.PAUSED_OTP,
            WorkflowStateEnum.PAUSED_CAPTCHA,
            WorkflowStateEnum.PAUSED_AUTH_EXPIRED,
            WorkflowStateEnum.RETRY_QUEUED,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.FORM_DETECTED: {
            WorkflowStateEnum.FORM_FILLED,
            WorkflowStateEnum.QUESTIONS_PENDING,
            WorkflowStateEnum.PAUSED_USER_INPUT,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.FORM_FILLED: {
            WorkflowStateEnum.QUESTIONS_PENDING,
            WorkflowStateEnum.READY_TO_SUBMIT,
            WorkflowStateEnum.PAUSED_USER_INPUT,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.QUESTIONS_PENDING: {
            WorkflowStateEnum.READY_TO_SUBMIT,
            WorkflowStateEnum.PAUSED_USER_INPUT,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.READY_TO_SUBMIT: {
            WorkflowStateEnum.SUBMITTING,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.SUBMITTING: {
            WorkflowStateEnum.APPLIED,
            WorkflowStateEnum.PAUSED_OTP,
            WorkflowStateEnum.PAUSED_CAPTCHA,
            WorkflowStateEnum.RETRY_QUEUED,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.PAUSED_OTP: {
            WorkflowStateEnum.APPLYING,
            WorkflowStateEnum.SUBMITTING,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.PAUSED_CAPTCHA: {
            WorkflowStateEnum.APPLYING,
            WorkflowStateEnum.SUBMITTING,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.PAUSED_USER_INPUT: {
            WorkflowStateEnum.FORM_FILLED,
            WorkflowStateEnum.READY_TO_SUBMIT,
            WorkflowStateEnum.FAILED,
        },
        WorkflowStateEnum.RETRY_QUEUED: {
            WorkflowStateEnum.APPLYING,
            WorkflowStateEnum.FAILED,
        },
        # Terminal states
        WorkflowStateEnum.APPLIED: set(),
        WorkflowStateEnum.FAILED: set(),
        WorkflowStateEnum.REJECTED: set(),
        WorkflowStateEnum.SKIPPED: set(),
        WorkflowStateEnum.EXPIRED: set(),
    }

    @classmethod
    def transition(cls, current_state: WorkflowStateEnum, target_state: WorkflowStateEnum) -> WorkflowStateEnum:
        valid_targets = cls.VALID_TRANSITIONS.get(current_state, set())
        if target_state not in valid_targets:
            raise InvalidStateTransitionException(
                current_state=current_state.value,
                target_state=target_state.value,
                reason=f"Transition from {current_state.value} to {target_state.value} is not allowed.",
            )
        return target_state


def test_valid_state_transitions():
    sm = ApplicationStateMachine()
    # Step by step happy path
    s1 = sm.transition(WorkflowStateEnum.DISCOVERED, WorkflowStateEnum.MATCHING)
    assert s1 == WorkflowStateEnum.MATCHING

    s2 = sm.transition(s1, WorkflowStateEnum.MATCHED)
    assert s2 == WorkflowStateEnum.MATCHED

    s3 = sm.transition(s2, WorkflowStateEnum.SHORTLISTED)
    assert s3 == WorkflowStateEnum.SHORTLISTED

    s4 = sm.transition(s3, WorkflowStateEnum.APPROVED)
    assert s4 == WorkflowStateEnum.APPROVED

    s5 = sm.transition(s4, WorkflowStateEnum.APPLYING)
    assert s5 == WorkflowStateEnum.APPLYING

    s6 = sm.transition(s5, WorkflowStateEnum.FORM_DETECTED)
    assert s6 == WorkflowStateEnum.FORM_DETECTED

    s7 = sm.transition(s6, WorkflowStateEnum.FORM_FILLED)
    assert s7 == WorkflowStateEnum.FORM_FILLED

    s8 = sm.transition(s7, WorkflowStateEnum.READY_TO_SUBMIT)
    assert s8 == WorkflowStateEnum.READY_TO_SUBMIT

    s9 = sm.transition(s8, WorkflowStateEnum.SUBMITTING)
    assert s9 == WorkflowStateEnum.SUBMITTING

    s10 = sm.transition(s9, WorkflowStateEnum.APPLIED)
    assert s10 == WorkflowStateEnum.APPLIED


def test_pause_and_resume_transitions():
    sm = ApplicationStateMachine()
    # Applying -> PAUSED_OTP -> Resume Applying
    p1 = sm.transition(WorkflowStateEnum.APPLYING, WorkflowStateEnum.PAUSED_OTP)
    assert p1 == WorkflowStateEnum.PAUSED_OTP

    r1 = sm.transition(p1, WorkflowStateEnum.APPLYING)
    assert r1 == WorkflowStateEnum.APPLYING


def test_invalid_state_transition_raises_error():
    sm = ApplicationStateMachine()
    # Direct jump from DISCOVERED to APPLIED is invalid
    with pytest.raises(InvalidStateTransitionException) as exc_info:
        sm.transition(WorkflowStateEnum.DISCOVERED, WorkflowStateEnum.APPLIED)
    assert "Cannot transition" in str(exc_info.value)

    # Terminal state APPLIED cannot transition to anything
    with pytest.raises(InvalidStateTransitionException):
        sm.transition(WorkflowStateEnum.APPLIED, WorkflowStateEnum.APPLYING)
