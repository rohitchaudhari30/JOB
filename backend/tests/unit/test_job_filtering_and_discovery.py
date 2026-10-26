import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from sqlalchemy import select

from app.domain.jobs.entities import Job
from app.domain.profile.entities import CandidateProfile, Resume, CandidateSkill
from app.application.matching.evaluators import HardFilterEvaluator
from app.infrastructure.browser.adapters.naukri import NaukriAdapter
from app.infrastructure.database.models.models import JobModel
from app.infrastructure.database.repositories.job_repository import (
    SqlAlchemyJobRepository,
    expand_role_aliases,
)
from app.application.jobs.use_cases import ListJobsUseCase


# =========================================================================
# 1. Seniority Filtering & Boundary Conditions
# =========================================================================

def test_hard_filter_evaluator_junior_candidate_blocks_senior_markers():
    """Verify candidate with 2 years experience (<=3.5 yrs) is blocked from leadership titles."""
    profile = CandidateProfile(
        id="p1",
        user_id="u1",
        total_experience_months=24,  # 2.0 years
    )

    lead_job = Job(
        id="j_lead",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e_lead",
        title="Principal Big Data Architect",
        company="Enterprise Tech",
        location="Pune",
        min_experience_years=2.0,
        max_experience_years=10.0,
    )

    passed, reason = HardFilterEvaluator.evaluate(profile, lead_job)
    assert not passed
    assert "Seniority mismatch" in reason


def test_hard_filter_evaluator_senior_candidate_allowed_senior_markers():
    """Verify candidate with 6 years experience (>3.5 yrs) is allowed senior leadership titles."""
    profile = CandidateProfile(
        id="p_senior",
        user_id="u_senior",
        total_experience_months=72,  # 6.0 years
    )

    lead_job = Job(
        id="j_lead2",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e_lead2",
        title="Principal Big Data Architect",
        company="Enterprise Tech",
        location="Pune",
        min_experience_years=5.0,
        max_experience_years=10.0,
    )

    passed, reason = HardFilterEvaluator.evaluate(profile, lead_job)
    assert passed
    assert "Passed all hard filters" in reason


def test_hard_filter_evaluator_junior_candidate_passes_valid_role():
    """Verify junior candidate (2 years) passes junior/mid level position."""
    profile = CandidateProfile(
        id="p2",
        user_id="u2",
        total_experience_months=24,  # 2.0 years
    )

    valid_job = Job(
        id="j_valid",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e_valid",
        title="Junior Data Engineer",
        company="Analytics Corp",
        location="Pune",
        min_experience_years=1.0,
        max_experience_years=3.0,
    )

    passed, reason = HardFilterEvaluator.evaluate(profile, valid_job)
    assert passed
    assert "Passed all hard filters" in reason


def test_sql_seniority_filter_boundary_2_year_candidate():
    """Verify a 2-year candidate searching min_exp=2.0, max_exp=4.0 gets senior titles excluded in SQL."""
    session = MagicMock()
    repo = SqlAlchemyJobRepository(session)
    stmt = select(JobModel)

    # 2.0 candidate with expanded max search range 4.0
    filtered_stmt = repo._apply_filters(stmt, min_experience=2.0, max_experience=4.0)
    compiled = filtered_stmt.compile()
    params = list(compiled.params.values())

    # Senior markers should be in the compiled SQL parameters
    assert "%director%" in params
    assert "%principal%" in params
    assert "%architect%" in params


def test_sql_seniority_filter_boundary_senior_candidate():
    """Verify a 6-year candidate searching min_exp=6.0, max_exp=8.0 does NOT have senior titles excluded."""
    session = MagicMock()
    repo = SqlAlchemyJobRepository(session)
    stmt = select(JobModel)

    filtered_stmt = repo._apply_filters(stmt, min_experience=6.0, max_experience=8.0)
    compiled = str(filtered_stmt.compile(compile_kwargs={"literal_binds": False}))

    # Senior markers should NOT be excluded for 6.0 years
    assert "%director%" not in compiled.lower()
    assert "%principal%" not in compiled.lower()


def test_jobs_with_missing_experience_values_not_rejected_blindly():
    """Verify jobs with None/missing min or max experience are safely included."""
    session = MagicMock()
    repo = SqlAlchemyJobRepository(session)
    stmt = select(JobModel)

    filtered_stmt = repo._apply_filters(stmt, min_experience=2.0, max_experience=4.0)
    compiled = str(filtered_stmt.compile(compile_kwargs={"literal_binds": False}))

    # Should contain OR conditions permitting NULL/None values
    assert "min_experience_years IS NULL" in compiled or "min_experience_years is null" in compiled.lower()
    assert "max_experience_years IS NULL" in compiled or "max_experience_years is null" in compiled.lower()


# =========================================================================
# 2. Naukri JSON-LD Structured Data Parsing Fallback
# =========================================================================

def test_naukri_json_ld_parsing_valid_single_and_array():
    """Test extracting valid single JobPosting and array of JobPostings."""
    valid_single = json.dumps({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        "title": "Data Engineer - ETL / Big Data",
        "url": "https://www.naukri.com/job-listings-12345678",
        "identifier": {"value": "12345678"},
        "hiringOrganization": {"name": "Tech Corp"},
        "jobLocation": {
            "address": {
                "addressLocality": "Bangalore",
                "addressCountry": "India"
            }
        },
        "description": "Building scalable Spark pipelines.",
        "experienceRequirements": "2-5 yrs",
        "baseSalary": {
            "value": {"minValue": "1200000", "maxValue": "1800000"}
        },
        "datePosted": "2026-10-25"
    })

    valid_array = json.dumps([
        {
            "@type": "JobPosting",
            "title": "Senior Python Developer",
            "url": "https://www.naukri.com/job-listings-87654321",
            "identifier": "87654321",
            "hiringOrganization": "Python Works",
            "jobLocation": "Pune",
            "experienceRequirements": "4-8 yrs"
        }
    ])

    results = NaukriAdapter.parse_naukri_json_ld([valid_single, valid_array])
    assert len(results) == 2
    assert results[0]["title"] == "Data Engineer - ETL / Big Data"
    assert results[0]["company"] == "Tech Corp"
    assert results[0]["location"] == "Bangalore, India"
    assert results[0]["cardJobId"] == "12345678"
    assert results[0]["expText"] == "2-5 yrs"
    assert results[0]["salText"] == "1200000-1800000"

    assert results[1]["title"] == "Senior Python Developer"
    assert results[1]["company"] == "Python Works"
    assert results[1]["location"] == "Pune"


def test_naukri_json_ld_parsing_graph_structure():
    """Test extracting JobPostings from an @graph container."""
    graph_json = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Organization", "name": "Google"},
            {
                "@type": "JobPosting",
                "title": "Machine Learning Engineer",
                "url": "https://www.naukri.com/job-listings-9999",
                "hiringOrganization": {"name": "AI Labs"},
                "jobLocation": {"address": "Hyderabad"}
            }
        ]
    })

    results = NaukriAdapter.parse_naukri_json_ld([graph_json])
    assert len(results) == 1
    assert results[0]["title"] == "Machine Learning Engineer"
    assert results[0]["company"] == "AI Labs"
    assert results[0]["location"] == "Hyderabad"


def test_naukri_json_ld_parsing_malformed_and_empty():
    """Test resilience against malformed JSON, empty strings, and non-job scripts."""
    raw_scripts = [
        "",
        "   ",
        "{malformed: json; syntax error!}",
        json.dumps({"@type": "WebSite", "name": "Naukri.com"}),
        json.dumps([])
    ]

    results = NaukriAdapter.parse_naukri_json_ld(raw_scripts)
    assert results == []


def test_naukri_json_ld_parsing_duplicates():
    """Test deduplication of identical JobPostings appearing in multiple scripts."""
    job_dup = {
        "@type": "JobPosting",
        "title": "Full Stack Engineer",
        "url": "https://www.naukri.com/job-listings-dup100",
        "identifier": "dup100",
        "hiringOrganization": {"name": "Dup Inc"}
    }
    scripts = [json.dumps(job_dup), json.dumps(job_dup), json.dumps([job_dup])]

    results = NaukriAdapter.parse_naukri_json_ld(scripts)
    assert len(results) == 1
    assert results[0]["cardJobId"] == "dup100"


# =========================================================================
# 3. Role Aliases & Synonym Mapping
# =========================================================================

def test_role_alias_expansion_frontend_developer():
    """Verify Frontend Developer expands to Front-End Engineer and equivalent variants."""
    aliases = expand_role_aliases("Frontend Developer")
    assert "frontend developer" in aliases
    assert "frontend engineer" in aliases
    assert "front-end engineer" in aliases
    assert "front end engineer" in aliases
    assert "front-end developer" in aliases
    # Must not contain false positives
    assert "backend developer" not in aliases
    assert "product manager" not in aliases


def test_role_alias_expansion_frontend_engineer():
    """Verify Front-End Engineer produces consistent expansions."""
    aliases = expand_role_aliases("Front-End Engineer")
    assert "frontend developer" in aliases
    assert "front-end engineer" in aliases
    assert "frontend engineer" in aliases


def test_role_alias_expansion_qa_sdet():
    """Verify QA expands to SDET, Quality Assurance without drift."""
    aliases = expand_role_aliases("qa engineer")
    assert "qa engineer" in aliases
    assert "sdet" in aliases
    assert "quality assurance" in aliases


def test_role_alias_expansion_unknown_role():
    """Verify custom/unknown role is preserved without errors."""
    aliases = expand_role_aliases("Bioinformatics Specialist")
    assert aliases == ["bioinformatics specialist"]


# =========================================================================
# 4. Pagination & Dismissed Job Exclusion
# =========================================================================

@pytest.mark.asyncio
async def test_pagination_and_dismissed_job_exclusion_in_use_case():
    """Verify ListJobsUseCase passes exclude_job_ids to repository and preserves true total count."""
    mock_repo = MagicMock()
    mock_repo.list_jobs = AsyncMock(return_value=[
        Job(id="j1", source_id="naukri", external_job_id="e1", title="Dev 1", company="C1", location="L1", min_experience_years=1.0, max_experience_years=3.0, apply_url="http://example.com/1"),
        Job(id="j2", source_id="naukri", external_job_id="e2", title="Dev 2", company="C2", location="L2", min_experience_years=1.0, max_experience_years=3.0, apply_url="http://example.com/2"),
    ])
    mock_repo.count_jobs = AsyncMock(return_value=98)

    use_case = ListJobsUseCase(mock_repo)
    result = await use_case.execute(
        skip=0,
        limit=25,
        exclude_job_ids=["dismissed_1", "dismissed_2"]
    )

    assert result["total"] == 98
    assert len(result["items"]) == 2
    assert result["skip"] == 0
    assert result["limit"] == 25

    mock_repo.list_jobs.assert_awaited_once()
    assert mock_repo.list_jobs.call_args[1]["exclude_job_ids"] == ["dismissed_1", "dismissed_2"]
    mock_repo.count_jobs.assert_awaited_once()
    assert mock_repo.count_jobs.call_args[1]["exclude_job_ids"] == ["dismissed_1", "dismissed_2"]


# =========================================================================
# 5. Resume Ownership, Authorization & Skills Grounding
# =========================================================================

@pytest.mark.asyncio
async def test_resume_ownership_validation_unauthorized_user():
    """Verify that providing another user's resume_id raises 404 and does not proceed."""
    from app.api.v1.jobs import discover_jobs, DiscoverJobsRequest
    from app.domain.auth.entities import User

    current_user = User(id="user_active", email="active@test.com", hashed_password="pw")
    mock_resume_repo = MagicMock()
    # Resume belongs to someone else!
    mock_resume_repo.get_by_id = AsyncMock(return_value=Resume(
        id="res_other",
        user_id="user_attacker",
        label="Stolen Resume",
        target_role="Engineer",
        file_path="/tmp/res.pdf",
        file_name="res.pdf"
    ))

    req = DiscoverJobsRequest(resume_id="res_other")
    response_mock = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await discover_jobs(
            req=req,
            response=response_mock,
            current_user=current_user,
            job_repo=MagicMock(),
            source_repo=MagicMock(),
            task_repo=MagicMock(),
            session_repo=MagicMock(),
            profile_repo=MagicMock(),
            resume_repo=mock_resume_repo,
        )

    assert exc_info.value.status_code == 404
    assert "does not belong to active user" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_resume_missing_raises_404():
    """Verify missing resume_id raises 404 instead of silent fallback."""
    from app.api.v1.jobs import discover_jobs, DiscoverJobsRequest
    from app.domain.auth.entities import User

    current_user = User(id="user_active", email="active@test.com", hashed_password="pw")
    mock_resume_repo = MagicMock()
    mock_resume_repo.get_by_id = AsyncMock(return_value=None)

    req = DiscoverJobsRequest(resume_id="nonexistent_resume_id")
    response_mock = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        await discover_jobs(
            req=req,
            response=response_mock,
            current_user=current_user,
            job_repo=MagicMock(),
            source_repo=MagicMock(),
            task_repo=MagicMock(),
            session_repo=MagicMock(),
            profile_repo=MagicMock(),
            resume_repo=mock_resume_repo,
        )

    assert exc_info.value.status_code == 404
    assert "not found" in str(exc_info.value.detail)
