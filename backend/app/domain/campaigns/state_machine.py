from enum import Enum
from typing import Set


class CampaignStateEnum(str, Enum):
    DRAFT = "DRAFT"
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    ARCHIVED = "ARCHIVED"


class ExecutionStateEnum(str, Enum):
    INITIALIZING = "INITIALIZING"
    RUNNING = "RUNNING"
    PAUSED_OTP = "PAUSED_OTP"
    PAUSED_CAPTCHA = "PAUSED_CAPTCHA"
    PAUSED_SESSION = "PAUSED_SESSION"
    PAUSED_LIMIT = "PAUSED_LIMIT"
    PAUSED_USER = "PAUSED_USER"
    RECOVERY_PENDING = "RECOVERY_PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    ABORTED = "ABORTED"


class DecisionEnum(str, Enum):
    AUTO_APPLY = "AUTO_APPLY"
    REVIEW = "REVIEW"
    SKIP = "SKIP"


class InvalidStateTransitionException(Exception):
    def __init__(self, current_state: str, target_state: str, reason: str = ""):
        self.current_state = current_state
        self.target_state = target_state
        self.reason = reason
        msg = f"Cannot transition from '{current_state}' to '{target_state}'."
        if reason:
            msg += f" Reason: {reason}"
        super().__init__(msg)


class CampaignStateMachine:
    """Enforces strict lifecycle transitions for Campaigns."""

    VALID_TRANSITIONS: dict[CampaignStateEnum, Set[CampaignStateEnum]] = {
        CampaignStateEnum.DRAFT: {
            CampaignStateEnum.SCHEDULED,
            CampaignStateEnum.RUNNING,
            CampaignStateEnum.ARCHIVED,
        },
        CampaignStateEnum.SCHEDULED: {
            CampaignStateEnum.RUNNING,
            CampaignStateEnum.PAUSED,
            CampaignStateEnum.ARCHIVED,
        },
        CampaignStateEnum.RUNNING: {
            CampaignStateEnum.PAUSED,
            CampaignStateEnum.COMPLETED,
            CampaignStateEnum.SCHEDULED,
            CampaignStateEnum.ARCHIVED,
        },
        CampaignStateEnum.PAUSED: {
            CampaignStateEnum.RUNNING,
            CampaignStateEnum.SCHEDULED,
            CampaignStateEnum.ARCHIVED,
        },
        CampaignStateEnum.COMPLETED: {
            CampaignStateEnum.SCHEDULED,
            CampaignStateEnum.RUNNING,
            CampaignStateEnum.ARCHIVED,
        },
        CampaignStateEnum.ARCHIVED: set(),  # Terminal state
    }

    @classmethod
    def can_transition(cls, current: CampaignStateEnum, target: CampaignStateEnum) -> bool:
        return target in cls.VALID_TRANSITIONS.get(current, set())

    @classmethod
    def validate_transition(cls, current: CampaignStateEnum, target: CampaignStateEnum):
        if not cls.can_transition(current, target):
            raise InvalidStateTransitionException(
                current.value,
                target.value,
                f"Valid targets from '{current.value}': {[s.value for s in cls.VALID_TRANSITIONS.get(current, set())]}",
            )


class ExecutionStateMachine:
    """Enforces transitions for active campaign execution runs."""

    VALID_TRANSITIONS: dict[ExecutionStateEnum, Set[ExecutionStateEnum]] = {
        ExecutionStateEnum.INITIALIZING: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.FAILED,
            ExecutionStateEnum.ABORTED,
            ExecutionStateEnum.RECOVERY_PENDING,
        },
        ExecutionStateEnum.RUNNING: {
            ExecutionStateEnum.PAUSED_OTP,
            ExecutionStateEnum.PAUSED_CAPTCHA,
            ExecutionStateEnum.PAUSED_SESSION,
            ExecutionStateEnum.PAUSED_LIMIT,
            ExecutionStateEnum.PAUSED_USER,
            ExecutionStateEnum.RECOVERY_PENDING,
            ExecutionStateEnum.COMPLETED,
            ExecutionStateEnum.FAILED,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.PAUSED_OTP: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.PAUSED_USER,
            ExecutionStateEnum.FAILED,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.PAUSED_CAPTCHA: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.PAUSED_USER,
            ExecutionStateEnum.FAILED,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.PAUSED_SESSION: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.PAUSED_USER,
            ExecutionStateEnum.FAILED,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.PAUSED_LIMIT: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.PAUSED_USER,
            ExecutionStateEnum.COMPLETED,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.PAUSED_USER: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.RECOVERY_PENDING: {
            ExecutionStateEnum.RUNNING,
            ExecutionStateEnum.FAILED,
            ExecutionStateEnum.ABORTED,
        },
        ExecutionStateEnum.COMPLETED: set(),
        ExecutionStateEnum.FAILED: set(),
        ExecutionStateEnum.ABORTED: set(),
    }

    @classmethod
    def can_transition(cls, current: ExecutionStateEnum, target: ExecutionStateEnum) -> bool:
        return target in cls.VALID_TRANSITIONS.get(current, set())

    @classmethod
    def validate_transition(cls, current: ExecutionStateEnum, target: ExecutionStateEnum):
        if not cls.can_transition(current, target):
            raise InvalidStateTransitionException(
                current.value,
                target.value,
                f"Valid targets from '{current.value}': {[s.value for s in cls.VALID_TRANSITIONS.get(current, set())]}",
            )
