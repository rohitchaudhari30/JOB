import pytest
from unittest.mock import AsyncMock
from app.application.applications.use_cases import ListApplicationsUseCase
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.api.v1.applications import list_applications, get_application_stats
from app.domain.auth.entities import User


@pytest.mark.asyncio
async def test_list_applications_pagination_metadata():
    """DEF-03: Verify server-side pagination metadata contract."""
    mock_app_repo = AsyncMock()
    
    fake_apps = [
        Application(
            id=f"app-{i}",
            user_id="user_123",
            job_id=f"job-{i}",
            idempotency_key=f"idemp-{i}",
            workflow_state=WorkflowStateEnum.APPROVED,
        )
        for i in range(10)
    ]
    mock_app_repo.list_by_user.return_value = fake_apps[:5]
    mock_app_repo.count_by_user.return_value = 100

    current_user = User(
        id="user_123",
        email="test@example.com",
        hashed_password="hash",
        full_name="Tester",
    )

    response = await list_applications(
        current_user=current_user,
        app_repo=mock_app_repo,
        state=None,
        page=2,
        page_size=5,
        skip=None,
        limit=None,
    )

    assert response.total == 100
    assert response.page == 2
    assert response.page_size == 5
    assert response.total_pages == 20
    assert len(response.items) == 5
    assert response.items[0].id == "app-0"


@pytest.mark.asyncio
async def test_list_applications_skip_limit_backward_compatibility():
    """Verify skip/limit query parameters calculate effective page and page_size."""
    mock_app_repo = AsyncMock()
    mock_app_repo.list_by_user.return_value = []
    mock_app_repo.count_by_user.return_value = 50

    current_user = User(
        id="user_123",
        email="test@example.com",
        hashed_password="hash",
        full_name="Tester",
    )

    response = await list_applications(
        current_user=current_user,
        app_repo=mock_app_repo,
        state=None,
        page=1,
        page_size=25,
        skip=20,
        limit=10,
    )

    assert response.page == 3  # skip=20, limit=10 -> (20 // 10) + 1 = 3
    assert response.page_size == 10
    assert response.total_pages == 5


@pytest.mark.asyncio
async def test_get_application_stats_full_aggregate():
    """DEF-04: Verify stats calculates true SQL aggregate metrics without 1000-cap."""
    mock_app_repo = AsyncMock()
    mock_app_repo.get_aggregate_stats.return_value = {
        "total": 1540,
        "applied": 1200,
        "applied_today": 45,
        "paused": 15,
        "failed": 25,
        "skipped": 200,
        "approval_required": 80,
        "reconciliation_required": 20,
        "needs_attention": 60,
        "success_rate": 77.9,
    }

    current_user = User(
        id="user_123",
        email="test@example.com",
        hashed_password="hash",
        full_name="Tester",
    )

    stats = await get_application_stats(
        current_user=current_user,
        app_repo=mock_app_repo,
    )

    assert stats.total == 1540
    assert stats.applied == 1200
    assert stats.applied_today == 45
    assert stats.success_rate == 77.9
    assert stats.needs_attention == 60
    assert stats.reconciliation_required == 20
