import os
import tempfile
from pathlib import Path
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.api.v1.applications import get_application_screenshot, get_applied_jobs_map
from app.core.config import settings
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.auth.entities import User
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository


@pytest.mark.asyncio
async def test_get_applied_job_map_scale_and_semantics():
    """Verify get_applied_job_map returns compact mapping at scale (>1000 items) with accurate semantics."""
    mock_session = AsyncMock()
    repo = SqlAlchemyApplicationRepository(session=mock_session)

    # Simulate 1,200 applications (surpassing the 1,000 record pagination cap)
    mock_rows = []
    for i in range(1200):
        state = WorkflowStateEnum.APPLIED.value if i % 2 == 0 else WorkflowStateEnum.RECONCILIATION_REQUIRED.value
        dt = datetime(2026, 10, 9, 8, 30, 0, tzinfo=timezone.utc)
        mock_rows.append((f"job-{i}", state, dt, dt))

    mock_result = MagicMock()
    mock_result.all.return_value = mock_rows
    mock_session.execute.return_value = mock_result

    res = await repo.get_applied_job_map("user_test_123")

    # Assert all 1,200 records are returned without pagination truncation
    assert len(res) == 1200
    assert res["job-0"]["status"] == "APPLIED"
    assert "2026-10-09" in res["job-0"]["applied_at"]
    assert res["job-1"]["status"] == "RECONCILIATION_REQUIRED"
    assert "2026-10-09" in res["job-1"]["applied_at"]


@pytest.mark.asyncio
async def test_get_applied_job_map_api_endpoint():
    """Verify GET /applications/applied-map endpoint routes correctly with authenticated user scoping."""
    mock_repo = AsyncMock()
    mock_repo.get_applied_job_map.return_value = {
        "job-abc": {"status": "APPLIED", "applied_at": "2026-10-09T08:30:00+00:00"},
        "job-xyz": {"status": "RECONCILIATION_REQUIRED", "applied_at": "2026-10-09T09:15:00+00:00"},
    }

    current_user = User(
        id="user_active",
        email="test@example.com",
        hashed_password="pw",
        full_name="Active Candidate",
    )

    result = await get_applied_jobs_map(current_user=current_user, app_repo=mock_repo)

    mock_repo.get_applied_job_map.assert_awaited_once_with("user_active")
    assert "job-abc" in result
    assert result["job-abc"]["status"] == "APPLIED"
    assert result["job-xyz"]["status"] == "RECONCILIATION_REQUIRED"


@pytest.mark.asyncio
async def test_screenshot_rejects_resumes_directory_access():
    """Verify that targeting a resume file inside STORAGE_DIR is strictly blocked with 403 Forbidden."""
    current_user = User(
        id="user_test",
        email="user@example.com",
        hashed_password="pw",
        full_name="Candidate",
    )

    mock_app_repo = AsyncMock()

    # Attempting to access resume through the screenshot endpoint
    victim_app = Application(
        id="app-exploit",
        user_id="user_test",
        job_id="job-1",
        idempotency_key="idemp-exp",
        screenshot_file_path=os.path.join(settings.STORAGE_DIR, "resumes", "victim_resume.png"),
    )
    mock_app_repo.get_by_id.return_value = victim_app

    with pytest.raises(HTTPException) as exc_info:
        await get_application_screenshot(
            application_id="app-exploit",
            current_user=current_user,
            app_repo=mock_app_repo,
        )

    assert exc_info.value.status_code == 403
    assert "forbidden" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_screenshot_serves_valid_artifact_in_screenshots_directory():
    """Verify that a valid screenshot artifact residing in the screenshots directory is served cleanly."""
    current_user = User(
        id="user_legit",
        email="user@example.com",
        hashed_password="pw",
        full_name="Candidate",
    )

    mock_app_repo = AsyncMock()

    # Create temporary screenshot in screenshots dir
    screenshots_dir = Path(settings.STORAGE_DIR) / "screenshots"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    temp_img = screenshots_dir / "app_legit_test.png"
    temp_img.write_bytes(b"\x89PNG\r\n\x1a\nfake_image_content")

    try:
        legit_app = Application(
            id="app-legit",
            user_id="user_legit",
            job_id="job-legit",
            idempotency_key="idemp-legit",
            screenshot_file_path=str(temp_img),
        )
        mock_app_repo.get_by_id.return_value = legit_app

        response = await get_application_screenshot(
            application_id="app-legit",
            current_user=current_user,
            app_repo=mock_app_repo,
        )

        assert response.status_code == 200
        assert response.media_type == "image/png"
    finally:
        if temp_img.exists():
            temp_img.unlink()
