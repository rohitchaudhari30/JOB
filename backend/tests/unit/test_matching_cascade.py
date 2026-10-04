import pytest
from app.application.matching.cascade import (
    HardFilterEvaluator,
    LocalSemanticSimilarity,
    MatchingCascadeEngine,
    SkillOverlapCalculator,
)
from app.domain.jobs.entities import Job
from app.domain.matching.entities import DecisionEnum, MatchRule
from app.domain.profile.entities import CandidateProfile, CandidateSkill
from tests.unit.test_ai_gateway import MockGroqProvider, MockGeminiProvider
from app.infrastructure.ai.gateway import MultiTierAIGateway


def test_hard_filter_experience_rejection():
    profile = CandidateProfile(
        id="prof_1",
        user_id="user_1",
        total_experience_months=24,  # 2 years
    )
    job = Job(
        id="job_1",
        source_id="naukri",
        external_job_id="123",
        title="Principal Architect",
        company="BigCorp",
        location="Bangalore",
        min_experience_years=8.0,  # Requires 8 years
    )

    passed, reason = HardFilterEvaluator.evaluate(profile, job)
    assert passed is False
    assert "Experience required: 8.0 yrs" in reason


def test_hard_filter_remote_preference_rejection():
    profile = CandidateProfile(
        id="prof_2",
        user_id="user_2",
        total_experience_months=60,
        location="Delhi",
        remote_preference="remote",
        relocation_preference=False,
    )
    job = Job(
        id="job_2",
        source_id="naukri",
        external_job_id="456",
        title="Senior Developer",
        company="OfficeCorp",
        location="Chennai",  # Onsite in Chennai
    )

    passed, reason = HardFilterEvaluator.evaluate(profile, job)
    assert passed is False
    assert "Candidate requires remote work" in reason


def test_skill_overlap_calculator():
    skills = ["Python", "Apache Spark", "PostgreSQL", "Docker"]
    jd_text = "We are seeking a Python data engineer proficient in Apache Spark and SQL databases. Docker is a plus."
    score, matched, missing = SkillOverlapCalculator.evaluate(skills, jd_text, "Data Engineer")

    assert "Python" in matched
    assert "Apache Spark" in matched
    assert "Docker" in matched
    assert score >= 75.0


def test_semantic_similarity():
    text_a = "Senior Data Engineer specializing in Python, Spark, and Distributed Systems"
    text_b = "Looking for Senior Python Data Engineer with Spark and cloud pipelines experience"
    sim = LocalSemanticSimilarity.compute(text_a, text_b)
    assert sim > 50.0


@pytest.mark.asyncio
async def test_matching_cascade_engine_high_match_auto_apply():
    profile = CandidateProfile(
        id="prof_high",
        user_id="user_high",
        headline="Senior Data Engineer",
        summary="Expert in Python, Spark, and Data Architecture",
        total_experience_months=60,  # 5 years
        skills=[
            CandidateSkill(id="s1", profile_id="prof_high", skill_name="Python", years_experience=5.0),
            CandidateSkill(id="s2", profile_id="prof_high", skill_name="Spark", years_experience=4.0),
            CandidateSkill(id="s3", profile_id="prof_high", skill_name="SQL", years_experience=5.0),
        ],
    )
    job = Job(
        id="job_high",
        source_id="naukri",
        external_job_id="high_101",
        title="Senior Data Engineer",
        company="Cloud Data Tech",
        location="Bangalore",
        min_experience_years=4.0,
        raw_description="We need a Senior Data Engineer skilled in Python, Spark, and SQL for big data processing.",
    )

    gateway = MultiTierAIGateway(primary_provider=MockGroqProvider(), fallback_provider=MockGeminiProvider())
    engine = MatchingCascadeEngine(ai_gateway=gateway)

    result = await engine.evaluate(profile, job)
    assert result.hard_filter_passed is True
    assert result.overall_score >= 85.0
    assert result.decision in (DecisionEnum.AUTO_APPLY, DecisionEnum.REQUIRE_APPROVAL)
    assert "Python" in result.matched_skills
