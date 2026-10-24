from datetime import datetime, timezone
from enum import Enum
from typing import Dict, FrozenSet, NamedTuple, Optional, Set


class JobLifecycleState(str, Enum):
    """
    Explicit lifecycle states for job listings in AutoApply.ai.
    Decoupled from user interaction state and feed visibility.
    """
    DISCOVERED = "DISCOVERED"  # Ingested, raw stream record pending persistence validation
    ACTIVE = "ACTIVE"          # Verified active listing eligible for discovery, search, and matching
    STALE = "STALE"            # Unseen past freshness threshold; deprioritized in feeds, awaiting re-verification
    EXPIRED = "EXPIRED"        # Authoritative expiration reached or past maximum aging window
    CLOSED = "CLOSED"          # Source portal confirmed position closed / no longer accepting candidates
    REMOVED = "REMOVED"        # Retracted by portal/employer (moderation, duplicate removal)
    ARCHIVED = "ARCHIVED"      # Historical cold storage preserved for application audit trails; excluded from feeds


class LifecycleTrigger(str, Enum):
    """Triggers that induce a state transition in a job record."""
    VALIDATED_ON_INGESTION = "VALIDATED_ON_INGESTION"
    REVERIFIED_ACTIVE = "REVERIFIED_ACTIVE"
    FRESHNESS_WINDOW_LAPSED = "FRESHNESS_WINDOW_LAPSED"
    EXPIRY_DATE_REACHED = "EXPIRY_DATE_REACHED"
    SOURCE_CONFIRMED_CLOSED = "SOURCE_CONFIRMED_CLOSED"
    SOURCE_REMOVED = "SOURCE_REMOVED"
    ARCHIVAL_POLICY_MET = "ARCHIVAL_POLICY_MET"
    MANUAL_OVERRIDE = "MANUAL_OVERRIDE"


class TransitionResult(NamedTuple):
    success: bool
    previous_state: JobLifecycleState
    new_state: JobLifecycleState
    changed: bool
    reason: str
    timestamp: datetime


class JobLifecycleStateMachine:
    """
    Pure domain state machine governing job lifecycle transitions.
    Thread-safe, deterministic, and idempotent under concurrent updates.
    """

    # Valid transitions mapping: source_state -> set of reachable target_states
    VALID_TRANSITIONS: Dict[JobLifecycleState, FrozenSet[JobLifecycleState]] = {
        JobLifecycleState.DISCOVERED: frozenset({
            JobLifecycleState.ACTIVE,
            JobLifecycleState.REMOVED,
        }),
        JobLifecycleState.ACTIVE: frozenset({
            JobLifecycleState.ACTIVE,    # Idempotent re-verification
            JobLifecycleState.STALE,
            JobLifecycleState.EXPIRED,
            JobLifecycleState.CLOSED,
            JobLifecycleState.REMOVED,
            JobLifecycleState.ARCHIVED,
        }),
        JobLifecycleState.STALE: frozenset({
            JobLifecycleState.ACTIVE,    # Reactivation if seen again in live scrape
            JobLifecycleState.STALE,     # Idempotent
            JobLifecycleState.EXPIRED,
            JobLifecycleState.CLOSED,
            JobLifecycleState.REMOVED,
            JobLifecycleState.ARCHIVED,
        }),
        JobLifecycleState.EXPIRED: frozenset({
            JobLifecycleState.ACTIVE,    # Re-opened / re-posted by employer
            JobLifecycleState.EXPIRED,   # Idempotent
            JobLifecycleState.ARCHIVED,
        }),
        JobLifecycleState.CLOSED: frozenset({
            JobLifecycleState.ACTIVE,    # Re-opened listing
            JobLifecycleState.CLOSED,    # Idempotent
            JobLifecycleState.ARCHIVED,
        }),
        JobLifecycleState.REMOVED: frozenset({
            JobLifecycleState.ARCHIVED,
            JobLifecycleState.REMOVED,   # Idempotent
        }),
        JobLifecycleState.ARCHIVED: frozenset({
            JobLifecycleState.ARCHIVED,  # Terminal cold state
        }),
    }

    # States eligible to be displayed in the active discovery/search feed
    ACTIVE_FEED_STATES: FrozenSet[JobLifecycleState] = frozenset({
        JobLifecycleState.ACTIVE,
    })

    # States eligible for automated matching evaluation and campaign queueing
    ACTIONABLE_STATES: FrozenSet[JobLifecycleState] = frozenset({
        JobLifecycleState.ACTIVE,
    })

    @classmethod
    def can_transition(cls, current: JobLifecycleState, target: JobLifecycleState) -> bool:
        """Checks if a transition between two states is mathematically valid."""
        allowed = cls.VALID_TRANSITIONS.get(current, frozenset())
        return target in allowed

    @classmethod
    def evaluate_transition(
        cls,
        current: JobLifecycleState,
        target: JobLifecycleState,
        trigger: LifecycleTrigger,
        reason: str = "",
        timestamp: Optional[datetime] = None,
    ) -> TransitionResult:
        """
        Executes a transition validation.
        Idempotent: If current == target, returns success with changed=False.
        """
        ts = timestamp or datetime.now(timezone.utc)

        if current == target:
            return TransitionResult(
                success=True,
                previous_state=current,
                new_state=target,
                changed=False,
                reason=reason or f"Idempotent touch ({trigger.value})",
                timestamp=ts,
            )

        if not cls.can_transition(current, target):
            return TransitionResult(
                success=False,
                previous_state=current,
                new_state=current,
                changed=False,
                reason=f"Illegal state transition from {current.value} to {target.value} via {trigger.value}",
                timestamp=ts,
            )

        return TransitionResult(
            success=True,
            previous_state=current,
            new_state=target,
            changed=True,
            reason=reason or trigger.value,
            timestamp=ts,
        )

    @classmethod
    def is_feed_eligible(cls, state: JobLifecycleState) -> bool:
        """Returns True if the job should appear in active public discovery feeds."""
        return state in cls.ACTIVE_FEED_STATES

    @classmethod
    def is_actionable(cls, state: JobLifecycleState) -> bool:
        """Returns True if the job can be queued for auto-apply or live submission."""
        return state in cls.ACTIONABLE_STATES

    @classmethod
    def can_safely_purge(
        cls,
        state: JobLifecycleState,
        has_applications: bool,
        is_saved: bool = False,
    ) -> bool:
        """
        Referential integrity guard.
        A job CANNOT be purged if:
        1. It is referenced by an application attempt (legal & candidate audit trail).
        2. A user currently has it bookmarked / saved.
        """
        if has_applications or is_saved:
            return False

        # Only expired, closed, removed, or archived jobs with zero references may be physically purged
        return state in {
            JobLifecycleState.EXPIRED,
            JobLifecycleState.CLOSED,
            JobLifecycleState.REMOVED,
            JobLifecycleState.ARCHIVED,
        }
