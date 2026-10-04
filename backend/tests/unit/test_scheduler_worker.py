import pytest
from app.workers.scheduler_worker import AutomationSchedulerWorker, ScheduleJobConfig


@pytest.mark.asyncio
async def test_scheduler_worker_interval_and_cron_jobs():
    worker = AutomationSchedulerWorker()
    worker.initialize()

    dummy_task_called = False

    def dummy_task():
        nonlocal dummy_task_called
        dummy_task_called = True

    # 1. Add Interval Job
    config_interval = ScheduleJobConfig(
        schedule_id="sched_test_1",
        user_id="user_101",
        source_type="naukri",
        roles=["Python Developer"],
        locations=["Bengaluru"],
        interval_minutes=60,
    )
    added = worker.add_schedule(config=config_interval, task_callable=dummy_task)
    assert added is True
    assert worker.get_schedule("sched_test_1") is not None

    # 2. Add Cron Job
    config_cron = ScheduleJobConfig(
        schedule_id="sched_test_2",
        user_id="user_101",
        source_type="naukri",
        roles=["Backend Engineer"],
        locations=["Remote"],
        cron_expression="0 9 * * 1-5",
    )
    added_cron = worker.add_schedule(config=config_cron, task_callable=dummy_task)
    assert added_cron is True

    # 3. List User Schedules
    schedules = worker.list_schedules_for_user("user_101")
    assert len(schedules) == 2

    # 4. Remove Schedule
    removed = worker.remove_schedule("sched_test_1")
    assert removed is True
    assert worker.get_schedule("sched_test_1") is None
    assert len(worker.list_schedules_for_user("user_101")) == 1

    # Cleanup
    worker.shutdown()
