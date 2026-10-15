"""Compares matching rules on the labelled set. Prints numbers; changes nothing.

Run from the backend folder:  python scripts/evaluate_matching.py
"""
import asyncio
import os
import sys
from dataclasses import replace

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("APP_ENV", "test")

from app.application.matching.cascade import MatchingCascadeEngine  # noqa: E402
from app.application.matching.evaluation import build_report  # noqa: E402
from app.domain.matching.entities import MatchRule  # noqa: E402
from app.infrastructure.bootstrap import register_infrastructure  # noqa: E402
from tests.data.match_eval_set import LABELLED_JOBS, candidate  # noqa: E402

register_infrastructure()

WEIGHTS = ("skills_weight", "experience_weight", "role_title_weight", "location_weight", "salary_weight",
           "semantic_weight", "ai_weight")


class _NoAI:
    async def match_job(self, **kwargs):
        raise RuntimeError("no provider")


def normalised(rule: MatchRule) -> MatchRule:
    total = sum(getattr(rule, name) for name in WEIGHTS)
    return replace(rule, **{name: getattr(rule, name) / total for name in WEIGHTS})


async def run(label: str, rule: MatchRule) -> None:
    engine = MatchingCascadeEngine(ai_gateway=_NoAI())
    profile = candidate()
    scores = [(await engine.evaluate(profile, job, rule=rule)).match_score for _, job in LABELLED_JOBS]
    grades = [grade for grade, _ in LABELLED_JOBS]
    print(f"{label:<28} weights sum={sum(getattr(rule, n) for n in WEIGHTS):.2f}  {build_report(scores, grades).as_dict()}")
    print("   scores by grade:", {g: [s for s, gg in zip(scores, grades) if gg == g] for g in (3, 2, 1, 0)})


async def main() -> None:
    await run("current defaults", MatchRule())
    await run("weights normalised to 1.0", normalised(MatchRule()))


if __name__ == "__main__":
    asyncio.run(main())
