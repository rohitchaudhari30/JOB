import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.jobs.entities import Job
from app.application.jobs.enrichment import detect_job_source_type, ensure_job_description


def test_detect_job_source_type_from_metadata():
    job1 = Job(id="1", source_id="src_naukri", source_type="naukri", external_job_id="e1", title="Dev", company="Co", location="Loc")
    assert detect_job_source_type(job1) == "naukri"

    job2 = Job(id="2", source_id="linkedin", external_job_id="e2", title="Dev", company="Co", location="Loc")
    assert detect_job_source_type(job2) == "linkedin"


def test_detect_job_source_type_from_url():
    job = Job(
        id="3",
        source_id="custom",
        source_type="other",
        external_job_id="e3",
        title="Dev",
        company="Co",
        location="Loc",
        apply_url="https://boards.greenhouse.io/company/jobs/12345",
    )
    assert detect_job_source_type(job) == "greenhouse"

    job_lever = Job(
        id="4",
        source_id="custom",
        external_job_id="e4",
        title="Dev",
        company="Co",
        location="Loc",
        apply_url="https://jobs.lever.co/company/abc",
    )
    assert detect_job_source_type(job_lever) == "lever"


@pytest.mark.asyncio
async def test_ensure_job_description_already_complete():
    full_desc = "A" * 350
    job = Job(
        id="j1",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e1",
        title="Software Engineer",
        company="Tech Corp",
        location="Bengaluru",
        raw_description=full_desc,
        apply_url="https://www.naukri.com/job/123",
    )
    mock_repo = AsyncMock()

    result = await ensure_job_description(job, mock_repo, min_length=300)
    assert result == full_desc
    assert mock_repo.save.call_count == 0


@pytest.mark.asyncio
async def test_ensure_job_description_triggers_jit_enrichment():
    short_desc = "Short snippet"
    enriched_desc = ("This is a comprehensive full job description retrieved via JIT enrichment. " * 10).strip()
    assert len(enriched_desc) > 300

    job = Job(
        id="j2",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e2",
        title="Senior Python Engineer",
        company="Tech Corp",
        location="Bengaluru",
        raw_description=short_desc,
        apply_url="https://www.naukri.com/job/456",
    )
    mock_repo = AsyncMock()

    mock_detailed_job = Job(
        id="j2",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e2",
        title="Senior Python Engineer",
        company="Tech Corp",
        location="Bengaluru",
        raw_description=enriched_desc,
        parsed_requirements={"mandatory_skills": ["Python", "AWS"]},
    )

    mock_adapter = MagicMock()
    mock_adapter.fetch_job_details = AsyncMock(return_value=mock_detailed_job)

    mock_context = AsyncMock()
    mock_context.close = AsyncMock()

    with patch("app.application.jobs.enrichment.adapter_registry") as mock_registry, \
         patch("app.application.jobs.enrichment.browser_manager") as mock_browser:
        mock_registry.list_supported_sources.return_value = ["naukri", "linkedin", "greenhouse"]
        mock_registry.get_source_adapter.return_value = mock_adapter
        mock_browser.create_isolated_context = AsyncMock(return_value=mock_context)

        result = await ensure_job_description(job, mock_repo, min_length=300)

        assert result == enriched_desc
        assert job.raw_description == enriched_desc
        assert job.parsed_requirements == {"mandatory_skills": ["Python", "AWS"]}
        mock_repo.save.assert_awaited_once_with(job)
        mock_context.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_ensure_job_description_handles_adapter_failure_gracefully():
    short_desc = "Short snippet"
    job = Job(
        id="j3",
        source_id="naukri",
        source_type="naukri",
        external_job_id="e3",
        title="Python Engineer",
        company="Tech Corp",
        location="Bengaluru",
        raw_description=short_desc,
        apply_url="https://www.naukri.com/job/789",
    )
    mock_repo = AsyncMock()

    mock_adapter = MagicMock()
    mock_adapter.fetch_job_details = AsyncMock(side_effect=RuntimeError("Cloudflare blocked request"))

    mock_context = AsyncMock()
    mock_context.close = AsyncMock()

    with patch("app.application.jobs.enrichment.adapter_registry") as mock_registry, \
         patch("app.application.jobs.enrichment.browser_manager") as mock_browser:
        mock_registry.list_supported_sources.return_value = ["naukri"]
        mock_registry.get_source_adapter.return_value = mock_adapter
        mock_browser.create_isolated_context = AsyncMock(return_value=mock_context)

        result = await ensure_job_description(job, mock_repo, min_length=300)

        assert result == short_desc
        assert mock_repo.save.call_count == 0
        mock_context.close.assert_awaited_once()
