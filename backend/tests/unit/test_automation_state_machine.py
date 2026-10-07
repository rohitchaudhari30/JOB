import pytest
from app.domain.automation.state_machine import (
    AutomationState,
    AutomationStateMachine,
    InvalidStateTransitionException,
)


def test_state_machine_valid_progression():
    sm = AutomationStateMachine(initial_state=AutomationState.IDLE)
    assert sm.current_state == AutomationState.IDLE
    assert not sm.is_terminal

    sm.transition_to(AutomationState.STARTING)
    assert sm.current_state == AutomationState.STARTING

    sm.transition_to(AutomationState.RUNNING)
    assert sm.current_state == AutomationState.RUNNING

    # Pause and resume
    sm.transition_to(AutomationState.PAUSED)
    assert sm.current_state == AutomationState.PAUSED

    sm.transition_to(AutomationState.RUNNING)
    assert sm.current_state == AutomationState.RUNNING

    # Complete
    sm.transition_to(AutomationState.COMPLETED)
    assert sm.current_state == AutomationState.COMPLETED
    assert sm.is_terminal


def test_state_machine_terminal_state_enforcement():
    sm = AutomationStateMachine(initial_state=AutomationState.COMPLETED)
    assert sm.is_terminal

    # Transitioning from COMPLETED to RUNNING must fail
    with pytest.raises(InvalidStateTransitionException) as exc_info:
        sm.transition_to(AutomationState.RUNNING)

    assert exc_info.value.current_state == AutomationState.COMPLETED
    assert exc_info.value.target_state == AutomationState.RUNNING


def test_state_machine_stopped_transition():
    sm = AutomationStateMachine(initial_state=AutomationState.RUNNING)
    sm.transition_to(AutomationState.STOPPING)
    sm.transition_to(AutomationState.STOPPED)
    assert sm.is_terminal

    with pytest.raises(InvalidStateTransitionException):
        sm.transition_to(AutomationState.RUNNING)
