"""AI-03: measured quality of the matching rule on a labelled set. Run before changing weights."""
import pytest

from app.application.matching.cascade import MatchingCascadeEngine
from app.application.matching.evaluation import build_report, pairwise_accuracy, spearman
from app.domain.matching.entities import MatchRule
from tests.data.match_eval_set import LABELLED_JOBS, candidate


class _NoAI:
    async def match_job(self, **kwargs):
        raise RuntimeError("no provider in tests")


async def _scores(rule: MatchRule):
    engine = MatchingCascadeEngine(ai_gateway=_NoAI())
    profile = candidate()
    return [(await engine.evaluate(profile, job, rule=rule)).match_score for _, job in LABELLED_JOBS]


def test_metrics_on_known_inputs():
    assert pairwise_accuracy([90, 70, 10], [3, 2, 0]) == 1.0
    assert pairwise_accuracy([10, 70, 90], [3, 2, 0]) == 0.0
    assert pairwise_accuracy([50, 50, 50], [3, 2, 0]) == 0.5
    assert spearman([1, 2, 3, 4], [1, 2, 3, 4]) == pytest.approx(1.0)
    assert spearman([4, 3, 2, 1], [1, 2, 3, 4]) == pytest.approx(-1.0)
    assert spearman([5, 5, 5], [1, 2, 3]) == 0.0


@pytest.mark.asyncio
async def test_default_rule_ranks_the_labelled_set_well():
    grades = [grade for grade, _ in LABELLED_JOBS]
    report = build_report(await _scores(MatchRule()), grades)

    # Measured today: pairwise 1.0, correlation 0.97. Floors sit a little under that, so a real drop is caught.
    assert report.pairwise_accuracy >= 0.95, report
    assert report.rank_correlation >= 0.90, report


@pytest.mark.asyncio
async def test_strong_fits_are_not_all_stuck_at_the_cap():
    grades = [grade for grade, _ in LABELLED_JOBS]
    report = build_report(await _scores(MatchRule()), grades)
    assert report.at_cap_share <= 0.25, report
