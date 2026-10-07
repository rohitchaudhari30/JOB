from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
import uuid
from app.domain.automation.state_machine import AutomationState, AutomationStateMachine


@dataclass
class AutomationRun:
    """Domain entity representing a persistent automation run."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    status: AutomationState = AutomationState.CREATED
    source_type: str = "naukri"
    target_count: int = 10
    discovered_count: int = 0
    matched_count: int = 0
    applied_count: int = 0
    failed_count: int = 0
    current_job_id: Optional[str] = None
    current_job_title: Optional[str] = None
    worker_id: str = "local-worker-1"
    error_message: Optional[str] = None
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def __post_init__(self):
        self._state_machine = AutomationStateMachine(initial_state=self.status)

    def transition_to(self, new_state: AutomationState) -> None:
        self._state_machine.transition_to(new_state)
        self.status = new_state
        self.updated_at = datetime.now(timezone.utc)
        if self._state_machine.is_terminal and not self.finished_at:
            self.finished_at = datetime.now(timezone.utc)
