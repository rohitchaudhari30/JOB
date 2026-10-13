import pytest
from app.application.matching.cascade import (
    HardFilterEvaluator,
    LocalLexicalSimilarity,
    MatchingCascadeEngine,
    SkillOverlapCalculator,
)
from app.application.matching.recommendation import RecommendationEngine
from app.domain.jobs.entities import Job
from app.domain.jobs.identity import CanonicalJobIdentifier
from app.domain.matching.entities import (
    IdentityConfidenceEnum,
    MatchBreakdown,
    MatchResult,
    MatchRule,
    RecommendationDecision,
)
from app.domain.profile.entities import CandidateProfile, CandidateSkill, Resume
from tests.unit.test_ai_gateway import MockGroqProvider, MockGeminiProvider
from app.infrastructure.ai.gateway import MultiTierAIGateway


class BrokenAIGateway:
    """Mock gateway that always throws to test deterministic fallback."""
    async def match_job(self, *args, **kwargs):
        raise RuntimeError("AI model service unavailable (HTTP 503)")


class MockGoodAIGateway:
    """Mock gateway that returns valid AI output."""
    async def match_job(self, *args, **kwargs):
        from types import SimpleNamespace
        return SimpleNamespace(
            score=88.0,
            reasoning="Strong technical alignment with modern data engineering stack.",
            matched_skills=["Python", "Apache Spark"],
            missing_skills=["Kubernetes"],
            provider_used="groq",
        )


# =============================================================================
# 1. Canonical Identity Tests
# =============================================================================

def test_canonical_identity_normalization():
    # Same requisition with noisy differences (case, location aliases, legal entities)
    key1, conf1 = CanonicalJobIdentifier.compute_canonical_key(
        company="Google India Pvt. Ltd.",
        title="Sr. Software Engineer - Backend",
        location="Bengaluru, Karnataka",
        description="Looking for Python backend engineers with distributed systems experience.",
    )

    key2, conf2 = CanonicalJobIdentifier.compute_canonical_key(
        company="Google",
        title="Senior Software Engineer, Backend",
        location="Bangalore",
        description="Looking for Python backend engineers with distributed systems experience.",
    )

    assert key1 == key2
    assert conf1 == IdentityConfidenceEnum.CANONICAL_DERIVED
    assert conf2 == IdentityConfidenceEnum.CANONICAL_DERIVED


def test_canonical_identity_differentiation():
    # Different titles at the same company must produce different keys
    key_de, _ = CanonicalJobIdentifier.compute_canonical_key(
        company="Amazon",
        title="Data Engineer II",
        location="Hyderabad",
        description="Build ETL pipelines using Spark.",
    )

    key_sde, _ = CanonicalJobIdentifier.compute_canonical_key(
        company="Amazon",
        title="Software Development Engineer II",
        location="Hyderabad",
        description="Build ETL pipelines using Spark.",
    )

    assert key_de != key_sde


def test_canonical_identity_edge_cases_and_distinct_vacancies():
    # 1. Missing description with different external_job_ids preserves distinct vacancies
    key_vac1, conf1 = CanonicalJobIdentifier.compute_canonical_key(
        company="Microsoft",
        title="Software Engineer",
        location="Bengaluru",
        description="",
        external_job_id="msft_job_101",
    )
    key_vac2, conf2 = CanonicalJobIdentifier.compute_canonical_key(
        company="Microsoft",
        title="Software Engineer",
        location="Bengaluru",
        description="",
        external_job_id="msft_job_102",
    )
    assert key_vac1 != key_vac2
    assert conf1 == IdentityConfidenceEnum.POSSIBLE_DUPLICATE
    assert conf2 == IdentityConfidenceEnum.POSSIBLE_DUPLICATE

    # 2. Changed description across revisions produces distinct fingerprints
    key_v1, _ = CanonicalJobIdentifier.compute_canonical_key(
        company="Meta",
        title="Production Engineer",
        location="Bangalore",
        description="Version 1: Focus on C++ and Linux kernel internals.",
    )
    key_v2, _ = CanonicalJobIdentifier.compute_canonical_key(
        company="Meta",
        title="Production Engineer",
        location="Bangalore",
        description="Version 2: Focus on Python and distributed systems reliability.",
    )
    assert key_v1 != key_v2

    # 3. Same requisition cross-posted across portals with identical description produces exact same canonical key
    key_naukri, conf_naukri = CanonicalJobIdentifier.compute_canonical_key(
        company="Uber India Technologies Pvt Ltd",
        title="Sr. Backend Developer",
        location="Bengaluru, Karnataka, India",
        description="Join Uber Core Services team building high-scale Kafka dispatching.",
    )
    key_linkedin, conf_linkedin = CanonicalJobIdentifier.compute_canonical_key(
        company="Uber",
        title="Senior Backend Developer",
        location="Bangalore",
        description="Join Uber Core Services team building high-scale Kafka dispatching.",
    )
    assert key_naukri == key_linkedin
    assert conf_naukri == IdentityConfidenceEnum.CANONICAL_DERIVED
    assert conf_linkedin == IdentityConfidenceEnum.CANONICAL_DERIVED


# =============================================================================
# 2. Stage 1: Hard Filter Short-Circuit (Zero AI Cost)
# =============================================================================

@pytest.mark.asyncio
async def test_hard_filter_short_circuit_zero_ai_cost():
    class AssertNoAICallGateway:
        async def match_job(self, *args, **kwargs):
            pytest.fail("AI Gateway was invoked despite failing Stage 1 Hard Filters!")

    engine = MatchingCascadeEngine(ai_gateway=AssertNoAICallGateway())

    profile = CandidateProfile(
        id="prof_junior",
        user_id="user_junior",
        total_experience_months=12,  # 1 year experience
        headline="Junior Developer",
    )

    job = Job(
        id="job_staff",
        source_id="naukri",
        external_job_id="999",
        title="Staff Engineer",
        company="Acme Corp",
        location="Bangalore",
        min_experience_years=8.0,  # Requires 8 years
        raw_description="Lead architecture across multiple distributed teams.",
    )

    result = await engine.evaluate(profile=profile, job=job)

    assert result.hard_filter_passed is False
    assert result.match_score == 0.0
    assert result.overall_score == 0.0
    assert result.decision == RecommendationDecision.REJECT
    assert result.ai_provider_used == "none"
    assert "Hard filter rejected" in result.reasoning_summary


# =============================================================================
# 3. Stages 2 & 3: Structured Skills and Lexical Similarity
# =============================================================================

def test_skill_overlap_and_lexical():
    skills = ["Python", "Spark", "SQL", "Docker"]
    score, matched, missing = SkillOverlapCalculator.evaluate(
        candidate_skills=skills,
        job_description="We are looking for Python and Spark engineers with Docker expertise.",
        job_title="Data Platform Engineer",
    )

    assert score == 75.0  # 3 of 4 matched
    assert "Python" in matched
    assert "Spark" in matched
    assert "Docker" in matched
    assert "SQL" in missing

    lex_score = LocalLexicalSimilarity.compute(
        "Python data engineering with Apache Spark",
        "Senior Data Engineer building Python pipelines with Spark",
    )
    assert lex_score > 50.0


# =============================================================================
# 4. Stages 4 & 5: AI Reasoning and Deterministic Fallback
# =============================================================================

@pytest.mark.asyncio
async def test_ai_matching_happy_path():
    engine = MatchingCascadeEngine(ai_gateway=MockGoodAIGateway())

    profile = CandidateProfile(
        id="prof_sr",
        user_id="user_sr",
        total_experience_months=60,  # 5 years
        headline="Senior Data Engineer",
        skills=[
            CandidateSkill(id="s1", profile_id="prof_sr", skill_name="Python"),
            CandidateSkill(id="s2", profile_id="prof_sr", skill_name="Apache Spark"),
        ],
    )

    job = Job(
        id="job_sr",
        source_id="naukri",
        external_job_id="101",
        title="Senior Data Engineer",
        company="TechCorp",
        location="Bangalore",
        min_experience_years=4.0,
        raw_description="Looking for Senior Data Engineer with strong Python and Spark experience.",
    )

    result = await engine.evaluate(profile=profile, job=job)

    assert result.hard_filter_passed is True
    assert result.match_score > 70.0
    assert result.overall_score == result.match_score  # Backward compatibility guarantee
    assert result.ai_provider_used == "groq"
    assert result.breakdown.skill_score > 0.0
    assert result.breakdown.ai_score == 88.0


@pytest.mark.asyncio
async def test_ai_fallback_deterministic_on_failure():
    engine = MatchingCascadeEngine(ai_gateway=BrokenAIGateway())

    profile = CandidateProfile(
        id="prof_sr",
        user_id="user_sr",
        total_experience_months=48,
        headline="Data Engineer",
        skills=[
            CandidateSkill(id="s1", profile_id="prof_sr", skill_name="Python"),
        ],
    )

    job = Job(
        id="job_de",
        source_id="naukri",
        external_job_id="102",
        title="Data Engineer",
        company="TechCorp",
        location="Pune",
        min_experience_years=3.0,
        raw_description="Looking for Data Engineer with Python skills.",
    )

    result = await engine.evaluate(profile=profile, job=job)

    assert result.hard_filter_passed is True
    assert result.ai_provider_used == "DETERMINISTIC_FALLBACK"
    assert result.match_score > 0.0
    assert result.overall_score == result.match_score
    assert "Evaluated via structured skill overlap" in result.reasoning_summary


# =============================================================================
# 5. Dual Score Separation: Match Score vs Recommendation Score
# =============================================================================

@pytest.mark.asyncio
async def test_match_score_vs_recommendation_score_separation():
    engine = MatchingCascadeEngine(ai_gateway=MockGoodAIGateway())

    profile = CandidateProfile(
        id="prof_match",
        user_id="user_match",
        total_experience_months=48,
        headline="Python Engineer",
        skills=[CandidateSkill(id="s1", profile_id="prof_match", skill_name="Python")],
    )

    job = Job(
        id="job_match",
        source_id="naukri",
        external_job_id="103",
        title="Python Engineer",
        company="Stripe",
        location="Bangalore",
        min_experience_years=3.0,
        raw_description="Looking for Python Engineer.",
    )

    # Case A: Normal quota, connected platform
    res_normal = await engine.evaluate(
        profile=profile,
        job=job,
        applied_today_count=5,
        daily_limit=20,
        is_already_applied=False,
        is_platform_connected=True,
    )

    # Case B: Already applied -> SKIP
    res_applied = await engine.evaluate(
        profile=profile,
        job=job,
        applied_today_count=5,
        daily_limit=20,
        is_already_applied=True,
        is_platform_connected=True,
    )
    assert res_applied.match_score == res_normal.match_score
    assert res_applied.overall_score == res_normal.overall_score
    assert res_applied.decision == RecommendationDecision.SAVE
    assert any("Already applied" in br for br in res_applied.blocking_reasons)

    # Case C: Platform disconnected & quota exhausted
    res_disconnected = await engine.evaluate(
        profile=profile,
        job=job,
        applied_today_count=20,
        daily_limit=20,
        is_already_applied=False,
        is_platform_connected=False,
    )
    assert res_disconnected.match_score == res_normal.match_score
    assert res_normal.recommendation_score > res_disconnected.recommendation_score
    assert any("disconnected" in br for br in res_disconnected.blocking_reasons)


# =============================================================================
# 6. Immutable Evaluation Key & Snapshot Hashes
# =============================================================================

def test_evaluation_key_and_snapshot_hashes():
    profile = CandidateProfile(
        id="prof_eval",
        user_id="user_eval",
        headline="Data Engineer",
        summary="ETL developer",
        skills=[CandidateSkill(id="s1", profile_id="prof_eval", skill_name="SQL")],
    )

    job = Job(
        id="job_eval",
        source_id="naukri",
        external_job_id="104",
        title="Data Engineer",
        company="Netflix",
        location="Mumbai",
        raw_description="Big data pipelines with SQL.",
    )

    resume = Resume(
        id="res_1",
        user_id="user_eval",
        label="Data Engineering Resume",
        target_role="Data Engineer",
        file_path="/storage/resumes/data_eng.pdf",
        file_name="data_eng.pdf",
        raw_text="Data Engineer with 5 years experience in SQL and Python.",
    )

    key1, r_hash1, p_hash1, j_hash1 = MatchingCascadeEngine.compute_evaluation_key(
        profile=profile, job=job, resume=resume
    )
    key2, r_hash2, p_hash2, j_hash2 = MatchingCascadeEngine.compute_evaluation_key(
        profile=profile, job=job, resume=resume
    )

    assert key1 == key2
    assert len(key1) == 64  # SHA-256 hex length
    assert r_hash1 == r_hash2
    assert p_hash1 == p_hash2
    assert j_hash1 == j_hash2

    # Modifying resume text changes evaluation key
    resume.raw_text = "Updated resume with Kubernetes"
    key3, r_hash3, _, _ = MatchingCascadeEngine.compute_evaluation_key(
        profile=profile, job=job, resume=resume
    )
    assert key3 != key1
    assert r_hash3 != r_hash1


@pytest.mark.asyncio
async def test_dense_vector_embedding_service_math_and_cache():
    from app.infrastructure.ai.embedding_service import CachedLocalEmbeddingService

    svc = CachedLocalEmbeddingService(dimension=64)
    assert svc.model_name == "local-feature-hash"
    assert svc.model_version == "2026.1"

    # Vectors for similar vs dissimilar text
    v_python1 = await svc.embed_text("Senior Python Backend Engineer building distributed APIs")
    v_python2 = await svc.embed_text("Senior Python Backend Engineer building distributed APIs")
    v_cooking = await svc.embed_text("Italian pastry chef baking sourdough bread and croissants")

    # Identical texts yield identical vectors (cache hit)
    assert v_python1 == v_python2
    assert len(v_python1) == 64

    # Cosine similarity self = 1.0 -> 100%
    sim_self = svc.cosine_similarity(v_python1, v_python2)
    assert pytest.approx(sim_self, 0.001) == 1.0
    norm_self = svc.normalize_similarity_to_percentage(sim_self)
    assert pytest.approx(norm_self, 0.1) == 100.0

    # Cosine similarity dissimilar < 0.5
    sim_diff = svc.cosine_similarity(v_python1, v_cooking)
    norm_diff = svc.normalize_similarity_to_percentage(sim_diff)
    assert norm_diff < norm_self


@pytest.mark.asyncio
async def test_cascade_records_embedding_version_and_model():
    engine = MatchingCascadeEngine(ai_gateway=MockGoodAIGateway())
    profile = CandidateProfile(
        id="prof_emb",
        user_id="user_emb",
        total_experience_months=36,
        headline="Software Engineer",
        skills=[CandidateSkill(id="s1", profile_id="prof_emb", skill_name="Go")],
    )
    job = Job(
        id="job_emb",
        source_id="linkedin",
        external_job_id="201",
        title="Software Engineer",
        company="Uber",
        location="Remote",
        min_experience_years=2.0,
        raw_description="Looking for Golang software engineer.",
    )

    result = await engine.evaluate(profile=profile, job=job)
    assert result.embedding_model == "local-feature-hash"
    assert result.embedding_version == "2026.1"
    assert result.semantic_score > 0.0

