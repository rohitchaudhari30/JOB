"""Lifecycle of one tailored-resume request."""
from enum import Enum
from typing import Dict, Set


class TailoringStatus(str, Enum):
    QUEUED = "QUEUED"                    # analysis requested, waiting for the worker
    ANALYZING = "ANALYZING"
    AWAITING_INPUT = "AWAITING_INPUT"    # plan ready: user answers questions and approves edits
    GENERATE_QUEUED = "GENERATE_QUEUED"  # approved edits waiting for the worker
    GENERATING = "GENERATING"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    SAVED = "SAVED"                      # user approved; can be sent with an application
    DISCARDED = "DISCARDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    STALE = "STALE"                      # the master file or the job text changed after the work was done


IN_FLIGHT = {
    TailoringStatus.QUEUED,
    TailoringStatus.ANALYZING,
    TailoringStatus.AWAITING_INPUT,
    TailoringStatus.GENERATE_QUEUED,
    TailoringStatus.GENERATING,
    TailoringStatus.READY_FOR_REVIEW,
}
TERMINAL = {
    TailoringStatus.SAVED,
    TailoringStatus.DISCARDED,
    TailoringStatus.FAILED,
    TailoringStatus.CANCELLED,
    TailoringStatus.STALE,
}

_S = TailoringStatus
TRANSITIONS: Dict[TailoringStatus, Set[TailoringStatus]] = {
    _S.QUEUED: {_S.ANALYZING, _S.CANCELLED, _S.FAILED},
    _S.ANALYZING: {_S.AWAITING_INPUT, _S.QUEUED, _S.FAILED, _S.CANCELLED, _S.STALE},
    _S.AWAITING_INPUT: {_S.QUEUED, _S.GENERATE_QUEUED, _S.DISCARDED, _S.CANCELLED, _S.STALE},
    _S.GENERATE_QUEUED: {_S.GENERATING, _S.CANCELLED, _S.FAILED},
    _S.GENERATING: {_S.READY_FOR_REVIEW, _S.AWAITING_INPUT, _S.FAILED, _S.CANCELLED, _S.STALE},
    _S.READY_FOR_REVIEW: {_S.SAVED, _S.DISCARDED, _S.GENERATE_QUEUED, _S.STALE},
    _S.SAVED: {_S.DISCARDED, _S.STALE},
    _S.DISCARDED: set(),
    _S.FAILED: set(),
    _S.CANCELLED: set(),
    _S.STALE: set(),
}


class InvalidTransition(ValueError):
    pass


def can_transition(current: TailoringStatus, target: TailoringStatus) -> bool:
    return target in TRANSITIONS.get(current, set())


def ensure_transition(current: TailoringStatus, target: TailoringStatus) -> None:
    if not can_transition(current, target):
        raise InvalidTransition(f"Cannot move a tailored resume from {current.value} to {target.value}.")
