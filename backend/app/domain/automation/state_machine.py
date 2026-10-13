from enum import Enum
from typing import Dict, Set
from app.core.exceptions import PlatformException


class AutomationState(str, Enum):
    """
    Formal lifecycle states for job automation runs.
    Enforces deterministic state transitions.
    """
    IDLE = "IDLE"
    CREATED = "CREATED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    STOPPING = "STOPPING"
    STOPPED = "STOPPED"
    ABORTED = "ABORTED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


# Deterministic state transition graph:
VALID_TRANSITIONS: Dict[AutomationState, Set[AutomationState]] = {
    AutomationState.IDLE: {
        AutomationState.CREATED,
        AutomationState.STARTING,
        AutomationState.RUNNING,
        AutomationState.PAUSED,
        AutomationState.ABORTED,
        AutomationState.STOPPED,
        AutomationState.FAILED,
    },
    AutomationState.CREATED: {
        AutomationState.STARTING,
        AutomationState.RUNNING,
        AutomationState.STOPPING,
        AutomationState.STOPPED,
        AutomationState.ABORTED,
        AutomationState.FAILED,
    },
    AutomationState.STARTING: {
        AutomationState.RUNNING,
        AutomationState.STOPPING,
        AutomationState.STOPPED,
        AutomationState.ABORTED,
        AutomationState.FAILED,
    },
    AutomationState.RUNNING: {
        AutomationState.PAUSED,
        AutomationState.STOPPING,
        AutomationState.STOPPED,
        AutomationState.ABORTED,
        AutomationState.FAILED,
        AutomationState.COMPLETED,
    },
    AutomationState.PAUSED: {
        AutomationState.RUNNING,
        AutomationState.STOPPING,
        AutomationState.STOPPED,
        AutomationState.ABORTED,
        AutomationState.FAILED,
    },
    AutomationState.STOPPING: {
        AutomationState.STOPPED,
        AutomationState.ABORTED,
        AutomationState.FAILED,
    },
    # Terminal states have no valid transitions
    AutomationState.STOPPED: set(),
    AutomationState.ABORTED: set(),
    AutomationState.FAILED: set(),
    AutomationState.COMPLETED: set(),
}


class InvalidStateTransitionException(PlatformException):
    def __init__(self, current_state: AutomationState, target_state: AutomationState):
        super().__init__(
            f"Invalid automation state transition from [{current_state.value}] to [{target_state.value}]."
        )
        self.current_state = current_state
        self.target_state = target_state


class AutomationStateMachine:
    """Encapsulates the state and enforces transition validity."""

    def __init__(self, initial_state: AutomationState = AutomationState.CREATED):
        self._current_state = initial_state

    @property
    def current_state(self) -> AutomationState:
        return self._current_state

    @property
    def is_terminal(self) -> bool:
        return self._current_state in (
            AutomationState.STOPPED,
            AutomationState.ABORTED,
            AutomationState.FAILED,
            AutomationState.COMPLETED,
        )

    def can_transition_to(self, target_state: AutomationState) -> bool:
        allowed = VALID_TRANSITIONS.get(self._current_state, set())
        return target_state in allowed

    def transition_to(self, target_state: AutomationState) -> AutomationState:
        if not self.can_transition_to(target_state):
            raise InvalidStateTransitionException(self._current_state, target_state)
        self._current_state = target_state
        return self._current_state
