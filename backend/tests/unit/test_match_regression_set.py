"""A small labelled set that any change to matching weights must keep passing (AI-03).

It checks ranking, not exact numbers: a strong fit must score above a partial fit, and a
partial fit above a poor fit. No AI provider is used, so the deterministic path is measured.
"""
import pytest

from app.application.matching.cascade import MatchingCascadeEngine
from app.domain.jobs.entities import Job
from app.domain.profile.entities import CandidateProfile, CandidateSkill


class _NoAI:
    async def match_job(self, **kwargs):
        raise RuntimeError("no provider in tests")


def _profile():
    skills = ["Python", "FastAPI", "PostgreSQL", "Docker"]
    return CandidateProfile(
        id="p1",
        user_id="u1",
        headline="Backend Engineer",
        location="Pune",
        total_experience_months=48,
        skills=[CandidateSkill(id=f"s{i}", profile_id="p1", skill_name=n) for i, n in enumerate(skills)],
    )


def _job(title, description, years=3.0):
    return Job(
        id=f"j-{title}", source_id="s", external_job_id=title, title=title, company="Acme",
        location="Pune", min_experience_years=years, raw_description=description,
    )


CASES = {
    "strong": _job("Backend Engineer", "Build APIs with Python, FastAPI and PostgreSQL. We deploy with Docker."),
    "partial": _job("Backend Engineer", "Python services and some Kubernetes. Java is a plus."),
    "poor": _job("Pastry Chef", "Bake bread and croissants every morning in our bakery.", years=0.0),
}


@pytest.mark.asyncio
async def test_strong_fit_beats_partial_beats_poor():
    engine = MatchingCascadeEngine(ai_gateway=_NoAI())
    scores = {name: (await engine.evaluate(_profile(), job)).match_score for name, job in CASES.items()}
    assert scores["strong"] > scores["partial"] > scores["poor"], scores
    assert scores["strong"] >= 60
    assert scores["poor"] < 60
