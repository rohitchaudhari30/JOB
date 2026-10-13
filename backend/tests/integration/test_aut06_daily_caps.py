"""AUT-06: account-level and platform caps apply to every run."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.application.automation.orchestrator import daily_cap_reached
from app.domain.applications.entities import ApplicationOutcomeStatus, WorkflowStateEnum
from app.infrastructure.database.models.models import (
    ApplicationModel,
    JobModel,
    JobSourceModel,
    UserModel,
)
from app.infrastructure.database.repositories.application_repository import (
    SqlAlchemyApplicationRepository,
)


def test_cap_helper_blocks_at_the_limit_and_explains_why():
    assert daily_cap_reached(10, 5, account_ceiling=50, platform_cap=30) is None
    assert "account" in daily_cap_reached(50, 5, 50, 30)
    assert "platform" in daily_cap_reached(10, 30, 50, 30)


@pytest.mark.asyncio
async def test_recent_submissions_count_uncertain_outcomes_but_not_old_or_failed(db_session):
    uid = f"u_{uuid.uuid4().hex[:6]}"
    db_session.add(UserModel(id=uid, email=f"{uid}@t.com", hashed_password="x", is_active=True))
    db_session.add(JobSourceModel(id="src_cap", source_type="naukri", base_url="https://www.naukri.com"))
    await db_session.flush()

    old = datetime.now(timezone.utc) - timedelta(hours=30)
    cases = [
        (WorkflowStateEnum.APPLIED, None),                    # counts
        (WorkflowStateEnum.SUBMISSION_UNKNOWN, None),         # counts: may have been sent
        (WorkflowStateEnum.RECONCILIATION_REQUIRED, None),    # counts
        (WorkflowStateEnum.FAILED, None),                     # does not count
        (WorkflowStateEnum.APPLIED, old),                     # too old
    ]
    for i, (state, updated) in enumerate(cases):
        job_id = f"job_cap_{i}_{uuid.uuid4().hex[:4]}"
        db_session.add(JobModel(
            id=job_id, source_id="src_cap", external_job_id=f"e{i}", title="Eng", company="Acme",
            location="Remote", apply_url="https://x/1", raw_description="d", is_active=True,
        ))
        db_session.add(ApplicationModel(
            id=f"app_cap_{i}", user_id=uid, job_id=job_id, idempotency_key=f"idem_cap_{i}",
            workflow_state=state.value, outcome_status=ApplicationOutcomeStatus.UNKNOWN.value,
            **({"updated_at": updated} if updated else {}),
        ))
    await db_session.commit()

    repo = SqlAlchemyApplicationRepository(db_session)
    assert await repo.count_recent_submissions(uid) == 3
    assert await repo.count_recent_submissions(uid, source_type="naukri") == 3
    assert await repo.count_recent_submissions(uid, source_type="linkedin") == 0
