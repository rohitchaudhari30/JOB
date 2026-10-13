"""AUT-08: uncertain submissions keep their quota slot; clean failures free it."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.application.automation.orchestrator import AutomationOrchestrator, slot_should_be_kept
from app.domain.applications.entities import WorkflowStateEnum as W


@pytest.mark.parametrize("state", [W.APPLIED, W.SUBMITTING, W.SUBMISSION_UNKNOWN, W.RECONCILIATION_REQUIRED])
def test_slot_is_kept_when_submission_happened_or_may_have(state):
    assert slot_should_be_kept(state) is True


@pytest.mark.parametrize("state", [W.FAILED, W.QUESTIONS_PENDING, W.PAUSED_CAPTCHA, W.PAUSED_OTP, W.SKIPPED, None])
def test_slot_is_freed_when_nothing_was_submitted(state):
    assert slot_should_be_kept(state) is False


@pytest.mark.asyncio
async def test_settle_consumes_for_uncertain_and_releases_for_failed():
    orch = AutomationOrchestrator()
    reservation = SimpleNamespace(id="res_1")

    quota = AsyncMock()
    await orch._settle_quota_slot(quota, reservation, W.SUBMISSION_UNKNOWN)
    quota.consume_slot.assert_awaited_once_with("res_1")
    quota.release_slot.assert_not_awaited()

    quota = AsyncMock()
    await orch._settle_quota_slot(quota, reservation, W.FAILED)
    quota.release_slot.assert_awaited_once_with("res_1")
    quota.consume_slot.assert_not_awaited()


@pytest.mark.asyncio
async def test_settle_does_nothing_without_a_reservation():
    quota = AsyncMock()
    await AutomationOrchestrator()._settle_quota_slot(quota, None, W.FAILED)
    quota.release_slot.assert_not_awaited()
    quota.consume_slot.assert_not_awaited()
