from datetime import datetime, timezone
import pytest
from app.domain.jobs.lifecycle import (
    JobLifecycleState,
    LifecycleTrigger,
    JobLifecycleStateMachine,
)


def test_valid_lifecycle_transitions():
    sm = JobLifecycleStateMachine

    # Ingestion flow: DISCOVERED -> ACTIVE
    res = sm.evaluate_transition(
        current=JobLifecycleState.DISCOVERED,
        target=JobLifecycleState.ACTIVE,
        trigger=LifecycleTrigger.VALIDATED_ON_INGESTION,
    )
    assert res.success is True
    assert res.changed is True
    assert res.new_state == JobLifecycleState.ACTIVE

    # Freshness lapse: ACTIVE -> STALE
    res = sm.evaluate_transition(
        current=JobLifecycleState.ACTIVE,
        target=JobLifecycleState.STALE,
        trigger=LifecycleTrigger.FRESHNESS_WINDOW_LAPSED,
    )
    assert res.success is True
    assert res.changed is True
    assert res.new_state == JobLifecycleState.STALE

    # Reactivation on fresh sighting: STALE -> ACTIVE
    res = sm.evaluate_transition(
        current=JobLifecycleState.STALE,
        target=JobLifecycleState.ACTIVE,
        trigger=LifecycleTrigger.REVERIFIED_ACTIVE,
    )
    assert res.success is True
    assert res.changed is True
    assert res.new_state == JobLifecycleState.ACTIVE

    # Closure on portal confirmation: ACTIVE -> CLOSED
    res = sm.evaluate_transition(
        current=JobLifecycleState.ACTIVE,
        target=JobLifecycleState.CLOSED,
        trigger=LifecycleTrigger.SOURCE_CONFIRMED_CLOSED,
    )
    assert res.success is True
    assert res.changed is True
    assert res.new_state == JobLifecycleState.CLOSED

    # Expiry on aging / timestamp: STALE -> EXPIRED
    res = sm.evaluate_transition(
        current=JobLifecycleState.STALE,
        target=JobLifecycleState.EXPIRED,
        trigger=LifecycleTrigger.EXPIRY_DATE_REACHED,
    )
    assert res.success is True
    assert res.new_state == JobLifecycleState.EXPIRED

    # Archival for cold storage: EXPIRED -> ARCHIVED
    res = sm.evaluate_transition(
        current=JobLifecycleState.EXPIRED,
        target=JobLifecycleState.ARCHIVED,
        trigger=LifecycleTrigger.ARCHIVAL_POLICY_MET,
    )
    assert res.success is True
    assert res.new_state == JobLifecycleState.ARCHIVED


def test_idempotent_transitions():
    sm = JobLifecycleStateMachine

    # Re-verifying an already ACTIVE job should succeed without error or spurious state change
    res = sm.evaluate_transition(
        current=JobLifecycleState.ACTIVE,
        target=JobLifecycleState.ACTIVE,
        trigger=LifecycleTrigger.REVERIFIED_ACTIVE,
    )
    assert res.success is True
    assert res.changed is False
    assert res.new_state == JobLifecycleState.ACTIVE

    # Re-checking an already CLOSED job
    res = sm.evaluate_transition(
        current=JobLifecycleState.CLOSED,
        target=JobLifecycleState.CLOSED,
        trigger=LifecycleTrigger.SOURCE_CONFIRMED_CLOSED,
    )
    assert res.success is True
    assert res.changed is False


def test_invalid_lifecycle_transitions():
    sm = JobLifecycleStateMachine

    # ARCHIVED is terminal; cannot transition directly to ACTIVE
    res = sm.evaluate_transition(
        current=JobLifecycleState.ARCHIVED,
        target=JobLifecycleState.ACTIVE,
        trigger=LifecycleTrigger.REVERIFIED_ACTIVE,
    )
    assert res.success is False
    assert res.changed is False
    assert res.new_state == JobLifecycleState.ARCHIVED
    assert "Illegal state transition" in res.reason


def test_feed_eligibility_and_actionability():
    sm = JobLifecycleStateMachine

    # Only ACTIVE is feed eligible
    assert sm.is_feed_eligible(JobLifecycleState.ACTIVE) is True
    assert sm.is_feed_eligible(JobLifecycleState.STALE) is False
    assert sm.is_feed_eligible(JobLifecycleState.EXPIRED) is False
    assert sm.is_feed_eligible(JobLifecycleState.CLOSED) is False
    assert sm.is_feed_eligible(JobLifecycleState.ARCHIVED) is False

    # Only ACTIVE is actionable for automation/matching
    assert sm.is_actionable(JobLifecycleState.ACTIVE) is True
    assert sm.is_actionable(JobLifecycleState.STALE) is False
    assert sm.is_actionable(JobLifecycleState.CLOSED) is False


def test_referential_integrity_purge_guard():
    sm = JobLifecycleStateMachine

    # Case 1: Job has applications -> NEVER purgable under any state
    for state in JobLifecycleState:
        assert sm.can_safely_purge(state, has_applications=True, is_saved=False) is False
        assert sm.can_safely_purge(state, has_applications=True, is_saved=True) is False

    # Case 2: Job is saved by a user -> NEVER purgable
    for state in JobLifecycleState:
        assert sm.can_safely_purge(state, has_applications=False, is_saved=True) is False

    # Case 3: Job is ACTIVE -> NEVER purgable
    assert sm.can_safely_purge(JobLifecycleState.ACTIVE, has_applications=False, is_saved=False) is False

    # Case 4: Job is unapplied, unsaved, and EXPIRED / CLOSED / ARCHIVED -> Safe to purge
    assert sm.can_safely_purge(JobLifecycleState.EXPIRED, has_applications=False, is_saved=False) is True
    assert sm.can_safely_purge(JobLifecycleState.CLOSED, has_applications=False, is_saved=False) is True
    assert sm.can_safely_purge(JobLifecycleState.ARCHIVED, has_applications=False, is_saved=False) is True
    assert sm.can_safely_purge(JobLifecycleState.REMOVED, has_applications=False, is_saved=False) is True
