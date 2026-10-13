"""AUT-04: REQUIRE_APPROVAL matches must never be auto-submitted."""
import pytest

from app.application.automation.orchestrator import should_auto_submit
from app.domain.matching.entities import RecommendationDecision


def test_auto_apply_decision_is_submitted_when_enabled():
    assert should_auto_submit(True, RecommendationDecision.AUTO_APPLY) is True


def test_require_approval_is_never_submitted():
    assert should_auto_submit(True, RecommendationDecision.REQUIRE_APPROVAL) is False


@pytest.mark.parametrize("decision", list(RecommendationDecision))
def test_nothing_is_submitted_when_auto_apply_is_off(decision):
    assert should_auto_submit(False, decision) is False
