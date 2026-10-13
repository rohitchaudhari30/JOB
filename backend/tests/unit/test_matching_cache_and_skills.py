from app.application.matching.cascade import MatchingCascadeEngine, SkillOverlapCalculator
from app.domain.jobs.entities import Job
from app.domain.matching.entities import MatchRule
from app.domain.profile.entities import CandidateProfile


def _profile():
    return CandidateProfile(id="p1", user_id="u1", total_experience_months=36)


def _job():
    return Job(id="j1", source_id="s", external_job_id="1", title="Dev", company="Acme", location="Pune")


def test_changing_rule_changes_evaluation_key():
    default_key = MatchingCascadeEngine.compute_evaluation_key(_profile(), _job(), rule=MatchRule())[0]
    tuned_key = MatchingCascadeEngine.compute_evaluation_key(
        _profile(), _job(), rule=MatchRule(skills_weight=0.5)
    )[0]
    assert default_key != tuned_key


def test_same_rule_gives_same_key():
    a = MatchingCascadeEngine.compute_evaluation_key(_profile(), _job(), rule=MatchRule())[0]
    b = MatchingCascadeEngine.compute_evaluation_key(_profile(), _job())[0]
    assert a == b


def test_java_does_not_match_javascript():
    _, matched, missing = SkillOverlapCalculator.evaluate(["Java"], "We need JavaScript experts", "Frontend")
    assert matched == [] and missing == ["Java"]


def test_go_does_not_match_good():
    _, matched, _ = SkillOverlapCalculator.evaluate(["Go"], "A good team player", "Engineer")
    assert matched == []


def test_real_skills_still_match():
    score, matched, _ = SkillOverlapCalculator.evaluate(
        ["Python", "C++", "Node.js", "Machine Learning"],
        "Python, C++ and Node.js. Experience in machine learning is a plus.",
        "Engineer",
    )
    assert matched == ["Python", "C++", "Node.js", "Machine Learning"]
    assert score == 100.0


import pytest
from app.domain.profile.entities import CandidateSkill


class _CountingGateway:
    calls = 0

    async def match_job(self, **kwargs):
        type(self).calls += 1
        raise RuntimeError("no provider in tests")


@pytest.mark.asyncio
async def test_llm_is_skipped_for_clearly_poor_fit():
    profile = _profile()
    profile.skills = [CandidateSkill(id="s1", profile_id="p1", skill_name="Rust")]
    job = _job()
    job.raw_description = "Italian pastry chef baking sourdough bread and croissants daily"
    gateway = _CountingGateway()
    result = await MatchingCascadeEngine(ai_gateway=gateway).evaluate(profile, job)
    assert gateway.calls == 0
    assert result.ai_provider_used == "DETERMINISTIC_FALLBACK"


