from datetime import datetime, timedelta, timezone
import pytest
from sqlalchemy import select
from httpx import AsyncClient

from app.core.config import settings
from app.domain.jobs.lifecycle import JobLifecycleState
from app.infrastructure.database.models.models import (
    ApplicationModel,
    JobModel,
    JobSourceModel,
    UserModel,
    UserJobStateModel,
)
from app.workers.job_retention_worker import run_job_retention_sweep


@pytest.mark.asyncio
async def test_stale_transition_when_active_unseen(db_session):
    now = datetime.now(timezone.utc)
    source = JobSourceModel(id="src-1", source_type="naukri", base_url="https://naukri.com", is_active=True)
    db_session.add(source)

    # Job unseen for 20 days (threshold is 14 days)
    old_active = JobModel(
        id="job-old-active",
        source_id="src-1",
        external_job_id="ext-old-1",
        title="Python Dev",
        company="Tech Corp",
        location="Remote",
        apply_url="https://example.com/apply1",
        raw_description="Python needed",
        lifecycle_state=JobLifecycleState.ACTIVE.value,
        is_active=True,
        last_seen_at=now - timedelta(days=20),
    )
    # Fresh active job (seen 2 days ago)
    fresh_active = JobModel(
        id="job-fresh-active",
        source_id="src-1",
        external_job_id="ext-fresh-1",
        title="Go Dev",
        company="Tech Corp",
        location="Remote",
        apply_url="https://example.com/apply2",
        raw_description="Go needed",
        lifecycle_state=JobLifecycleState.ACTIVE.value,
        is_active=True,
        last_seen_at=now - timedelta(days=2),
    )
    db_session.add_all([old_active, fresh_active])
    await db_session.commit()

    summary = await run_job_retention_sweep()
    assert summary["marked_stale"] == 1

    db_session.expire_all()
    res = await db_session.execute(select(JobModel).where(JobModel.id == "job-old-active"))
    updated_job = res.scalar_one()
    assert updated_job.lifecycle_state == JobLifecycleState.STALE.value
    assert updated_job.is_active is False

    res_fresh = await db_session.execute(select(JobModel).where(JobModel.id == "job-fresh-active"))
    fresh_job = res_fresh.scalar_one()
    assert fresh_job.lifecycle_state == JobLifecycleState.ACTIVE.value
    assert fresh_job.is_active is True


@pytest.mark.asyncio
async def test_expiry_transition_when_stale_unseen(db_session):
    now = datetime.now(timezone.utc)
    source = JobSourceModel(id="src-2", source_type="linkedin", base_url="https://linkedin.com", is_active=True)
    db_session.add(source)

    stale_job = JobModel(
        id="job-stale-expired",
        source_id="src-2",
        external_job_id="ext-stale-1",
        title="Backend Engineer",
        company="Data Corp",
        location="Bangalore",
        apply_url="https://example.com/apply3",
        raw_description="FastAPI",
        lifecycle_state=JobLifecycleState.STALE.value,
        is_active=False,
        last_seen_at=now - timedelta(days=35),  # past 30 days
    )
    db_session.add(stale_job)
    await db_session.commit()

    summary = await run_job_retention_sweep()
    assert summary["marked_expired"] == 1

    db_session.expire_all()
    res = await db_session.execute(select(JobModel).where(JobModel.id == "job-stale-expired"))
    job = res.scalar_one()
    assert job.lifecycle_state == JobLifecycleState.EXPIRED.value


@pytest.mark.asyncio
async def test_archival_protection_for_applied_job(db_session):
    now = datetime.now(timezone.utc)
    user = UserModel(id="u-test-1", email="candidate@example.com", hashed_password="dummy")
    source = JobSourceModel(id="src-3", source_type="indeed", base_url="https://indeed.com", is_active=True)
    job = JobModel(
        id="job-applied-past-purge",
        source_id="src-3",
        external_job_id="ext-app-1",
        title="Senior Architect",
        company="Cloud LLC",
        location="Hyderabad",
        apply_url="https://example.com/apply4",
        raw_description="Kubernetes, Python",
        lifecycle_state=JobLifecycleState.EXPIRED.value,
        is_active=False,
        updated_at=now - timedelta(days=100),  # past 90-day purge threshold
    )
    app = ApplicationModel(
        id="app-audit-1",
        user_id="u-test-1",
        job_id="job-applied-past-purge",
        idempotency_key="idem-app-1",
        workflow_state="APPLIED",
        outcome_status="SUBMITTED",
        job_title_snapshot="Senior Architect",
        company_snapshot="Cloud LLC",
    )
    db_session.add_all([user, source, job, app])
    await db_session.commit()

    summary = await run_job_retention_sweep()
    assert summary["archived"] == 1
    assert summary["purged"] == 0

    db_session.expire_all()
    # Job is preserved as ARCHIVED, not deleted
    res = await db_session.execute(select(JobModel).where(JobModel.id == "job-applied-past-purge"))
    preserved_job = res.scalar_one_or_none()
    assert preserved_job is not None
    assert preserved_job.lifecycle_state == JobLifecycleState.ARCHIVED.value

    # Application row is intact
    app_res = await db_session.execute(select(ApplicationModel).where(ApplicationModel.id == "app-audit-1"))
    preserved_app = app_res.scalar_one_or_none()
    assert preserved_app is not None
    assert preserved_app.job_title_snapshot == "Senior Architect"


@pytest.mark.asyncio
async def test_archival_protection_for_saved_job(db_session):
    now = datetime.now(timezone.utc)
    user = UserModel(id="u-test-2", email="saver@example.com", hashed_password="dummy")
    source = JobSourceModel(id="src-4", source_type="naukri", base_url="https://naukri.com", is_active=True)
    job = JobModel(
        id="job-saved-past-purge",
        source_id="src-4",
        external_job_id="ext-saved-1",
        title="ML Engineer",
        company="AI Inc",
        location="Remote",
        apply_url="https://example.com/apply5",
        raw_description="PyTorch",
        lifecycle_state=JobLifecycleState.CLOSED.value,
        is_active=False,
        updated_at=now - timedelta(days=95),
    )
    user_state = UserJobStateModel(
        id="ujs-1",
        user_id="u-test-2",
        job_id="job-saved-past-purge",
        is_saved=True,
        saved_at=now - timedelta(days=90),
    )
    db_session.add_all([user, source, job, user_state])
    await db_session.commit()

    summary = await run_job_retention_sweep()
    assert summary["archived"] == 1
    assert summary["purged"] == 0

    db_session.expire_all()
    res = await db_session.execute(select(JobModel).where(JobModel.id == "job-saved-past-purge"))
    preserved_job = res.scalar_one_or_none()
    assert preserved_job is not None
    assert preserved_job.lifecycle_state == JobLifecycleState.ARCHIVED.value


@pytest.mark.asyncio
async def test_safe_purge_unapplied_unsaved(db_session):
    now = datetime.now(timezone.utc)
    source = JobSourceModel(id="src-5", source_type="naukri", base_url="https://naukri.com", is_active=True)
    job = JobModel(
        id="job-purge-candidate",
        source_id="src-5",
        external_job_id="ext-purge-1",
        title="Intern",
        company="Old Startup",
        location="Pune",
        apply_url="https://example.com/apply6",
        raw_description="General",
        lifecycle_state=JobLifecycleState.EXPIRED.value,
        is_active=False,
        updated_at=now - timedelta(days=120),  # past 90 days, no apps, not saved
    )
    db_session.add_all([source, job])
    await db_session.commit()

    summary = await run_job_retention_sweep()
    assert summary["purged"] == 1

    res = await db_session.execute(select(JobModel).where(JobModel.id == "job-purge-candidate"))
    purged_job = res.scalar_one_or_none()
    assert purged_job is None


@pytest.mark.asyncio
async def test_dismissed_state_cleanup(db_session):
    now = datetime.now(timezone.utc)
    user = UserModel(id="u-test-3", email="user3@example.com", hashed_password="dummy")
    source = JobSourceModel(id="src-6", source_type="naukri", base_url="https://naukri.com", is_active=True)
    job1 = JobModel(
        id="job-dismissed-old",
        source_id="src-6",
        external_job_id="ext-d-1",
        title="J1",
        company="C1",
        location="L1",
        apply_url="https://example.com/1",
        raw_description="D1",
    )
    job2 = JobModel(
        id="job-dismissed-recent",
        source_id="src-6",
        external_job_id="ext-d-2",
        title="J2",
        company="C2",
        location="L2",
        apply_url="https://example.com/2",
        raw_description="D2",
    )
    # Old dismissal (70 days ago, past 60 days limit)
    old_dismissal = UserJobStateModel(
        id="ujs-old",
        user_id="u-test-3",
        job_id="job-dismissed-old",
        is_dismissed=True,
        is_saved=False,
        dismissed_at=now - timedelta(days=70),
    )
    # Recent dismissal (5 days ago)
    recent_dismissal = UserJobStateModel(
        id="ujs-recent",
        user_id="u-test-3",
        job_id="job-dismissed-recent",
        is_dismissed=True,
        is_saved=False,
        dismissed_at=now - timedelta(days=5),
    )
    db_session.add_all([user, source, job1, job2, old_dismissal, recent_dismissal])
    await db_session.commit()

    summary = await run_job_retention_sweep()
    assert summary["dismissals_cleaned"] == 1

    db_session.expire_all()
    old_res = await db_session.execute(select(UserJobStateModel).where(UserJobStateModel.id == "ujs-old"))
    assert old_res.scalar_one_or_none() is None

    recent_res = await db_session.execute(select(UserJobStateModel).where(UserJobStateModel.id == "ujs-recent"))
    assert recent_res.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_dry_run_mode_commits_nothing(db_session):
    now = datetime.now(timezone.utc)
    source = JobSourceModel(id="src-7", source_type="naukri", base_url="https://naukri.com", is_active=True)
    job = JobModel(
        id="job-dryrun-active",
        source_id="src-7",
        external_job_id="ext-dry-1",
        title="Dev",
        company="Company",
        location="Delhi",
        apply_url="https://example.com/dry",
        raw_description="Dev",
        lifecycle_state=JobLifecycleState.ACTIVE.value,
        is_active=True,
        last_seen_at=now - timedelta(days=25),
    )
    db_session.add_all([source, job])
    await db_session.commit()

    summary = await run_job_retention_sweep(dry_run=True)
    assert summary["marked_stale"] == 1
    assert summary["dry_run"] is True

    # Job is still ACTIVE in DB because dry_run=True
    res = await db_session.execute(select(JobModel).where(JobModel.id == "job-dryrun-active"))
    unchanged_job = res.scalar_one()
    assert unchanged_job.lifecycle_state == JobLifecycleState.ACTIVE.value
    assert unchanged_job.is_active is True
