"""AUT-01: a worker's state change must be durable and must not block other writers."""
import uuid

import pytest
from sqlalchemy import select

from app.domain.applications.entities import (
    Application,
    ApplicationOutcomeStatus,
    WorkflowStateEnum,
)
from app.infrastructure.database.models.models import ApplicationModel, JobModel, UserModel
from app.infrastructure.database.repositories.application_repository import (
    SqlAlchemyApplicationRepository,
)


async def _seed(factory):
    user_id, job_id = f"u_{uuid.uuid4().hex[:6]}", f"j_{uuid.uuid4().hex[:6]}"
    async with factory() as s:
        s.add(UserModel(id=user_id, email=f"{user_id}@test.com", hashed_password="x", is_active=True))
        s.add(JobModel(
            id=job_id, source_id="naukri", external_job_id=f"ext_{job_id}", title="Engineer",
            company="Acme", location="Remote", apply_url="https://example.com/1",
            raw_description="desc", is_active=True,
        ))
        s.add(ApplicationModel(
            id=f"a_{job_id}", user_id=user_id, job_id=job_id, idempotency_key=f"idem_{job_id}",
            workflow_state=WorkflowStateEnum.FORM_FILLED.value,
            outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
        ))
        await s.commit()
    return f"a_{job_id}"


async def _state_seen_by_other_connection(factory, app_id):
    async with factory() as other:
        row = await other.scalar(select(ApplicationModel.workflow_state).where(ApplicationModel.id == app_id))
        return row


@pytest.mark.asyncio
@pytest.mark.file_db
async def test_worker_state_change_is_visible_before_the_run_finishes(test_database):
    app_id = await _seed(test_database)

    async with test_database() as worker_session:
        repo = SqlAlchemyApplicationRepository(worker_session, commit_each_write=True)
        app = await repo.get_by_id(app_id)
        app.workflow_state = WorkflowStateEnum.SUBMITTING
        app.current_attempt_id = "att_1"
        await repo.save(app)

        # The worker has NOT committed explicitly and is still running.
        # Another connection must already see SUBMITTING (crash safety).
        assert await _state_seen_by_other_connection(test_database, app_id) == "SUBMITTING"


@pytest.mark.asyncio
@pytest.mark.file_db
async def test_default_repository_keeps_changes_until_the_caller_commits(test_database):
    """Request handlers rely on this: the request commits, not the repository."""
    app_id = await _seed(test_database)

    async with test_database() as request_session:
        repo = SqlAlchemyApplicationRepository(request_session)  # commit_each_write=False
        app = await repo.get_by_id(app_id)
        app.workflow_state = WorkflowStateEnum.APPROVED
        await repo.save(app)
        assert await _state_seen_by_other_connection(test_database, app_id) == "FORM_FILLED"
        await request_session.commit()
        assert await _state_seen_by_other_connection(test_database, app_id) == "APPROVED"


@pytest.mark.asyncio
@pytest.mark.file_db
async def test_second_writer_is_not_blocked_by_a_worker_that_just_saved(test_database):
    app_id = await _seed(test_database)

    async with test_database() as worker_session:
        repo = SqlAlchemyApplicationRepository(worker_session, commit_each_write=True)
        app = await repo.get_by_id(app_id)
        app.workflow_state = WorkflowStateEnum.SUBMITTING
        await repo.save(app)

        # A telemetry-style writer on another connection must not hit "database is locked".
        async with test_database() as telemetry:
            other = SqlAlchemyApplicationRepository(telemetry, commit_each_write=True)
            from app.domain.applications.entities import ApplicationEvent
            await other.add_event(ApplicationEvent(
                id=f"e_{uuid.uuid4().hex[:8]}", application_id=app_id,
                event_name="TELEMETRY", payload={},
            ))
