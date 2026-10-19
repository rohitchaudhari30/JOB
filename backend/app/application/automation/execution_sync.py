"""The one place that copies a live run's state onto its stored campaign execution (DUP-10).

The run is the live view; the execution row is the stored owner of status and counters. Both the
pause/resume/stop endpoints and the orchestrator's final sync go through these two functions.
"""
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.domain.automation.state_machine import AutomationState
from app.domain.campaigns.state_machine import ExecutionStateEnum

logger = logging.getLogger(__name__)

FINISHED_EXECUTION_STATES = (
    ExecutionStateEnum.COMPLETED.value,
    ExecutionStateEnum.FAILED.value,
    ExecutionStateEnum.ABORTED.value,
)


async def sync_control_state(
    execution_repo: Any, execution_id: Optional[str], new_status: ExecutionStateEnum, action: str
) -> None:
    """Pause / resume / stop: set the execution's status. Never raises; a failed sync is only logged."""
    if not execution_id:
        return
    try:
        exec_model = await execution_repo.get_by_id(execution_id)
        if exec_model:
            exec_model.status = new_status.value
            if new_status.value in FINISHED_EXECUTION_STATES:
                exec_model.completed_at = datetime.now(timezone.utc)
            await execution_repo.save(exec_model)
    except Exception as e:
        logger.warning(f"Failed to sync {action} state to execution [{execution_id}]: {e}")


def apply_final_state(exec_model: Any, session: Any) -> None:
    """Run ended: copy final status, error and counters onto the execution (caller saves it)."""
    if session.status == AutomationState.COMPLETED:
        exec_model.status = ExecutionStateEnum.COMPLETED.value
    elif session.status == AutomationState.FAILED:
        exec_model.status = ExecutionStateEnum.FAILED.value
        exec_model.error_message = session.error_message
    elif session.status in (AutomationState.ABORTED, AutomationState.STOPPED):
        exec_model.status = ExecutionStateEnum.ABORTED.value
    exec_model.completed_at = datetime.now(timezone.utc)
    exec_model.discovered_count = session.discovered_jobs_count
    exec_model.qualified_count = session.qualified_jobs_count
    exec_model.submitted_count = session.applications_submitted_count
    exec_model.failed_count = session.failed_applications_count
