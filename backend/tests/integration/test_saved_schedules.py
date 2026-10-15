import pytest

from app.core import database
from app.infrastructure.database.models.models import UserModel
from app.workers import scheduler_worker as sw


@pytest.mark.asyncio
async def test_saved_schedule_is_restored_after_restart():
    async with database.AsyncSessionLocal() as session:
        session.add(UserModel(id="u-sched", email="sched@example.com", hashed_password="x", full_name="S"))
        await session.commit()

    config = sw.ScheduleJobConfig(schedule_id="sched_test1", user_id="u-sched", roles=["Python"], interval_minutes=60)
    await sw.save_schedule(config)

    # Simulate a restart: the in-memory scheduler forgets everything.
    sw.scheduler_worker.shutdown()
    sw.scheduler_worker._configs.clear()
    try:
        assert await sw.restore_saved_schedules() == 1
        assert sw.scheduler_worker.get_schedule("sched_test1") is not None

        await sw.delete_saved_schedule("sched_test1")
        sw.scheduler_worker.shutdown()
        sw.scheduler_worker._configs.clear()
        assert await sw.restore_saved_schedules() == 0
    finally:
        sw.scheduler_worker.shutdown()
        sw.scheduler_worker._configs.clear()
