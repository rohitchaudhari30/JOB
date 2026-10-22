"""Which resume file an application sends: a saved job-specific copy, or the master resume."""
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.exceptions import AuthorizationException, ConflictException, EntityNotFoundException
from app.domain.applications.entities import Application, WorkflowStateEnum

_S = WorkflowStateEnum

# Before the portal is touched (or after a stop that allows a retry) the choice can still change.
CHOICE_EDITABLE = frozenset(
    {
        _S.DISCOVERED, _S.MATCHING, _S.MATCHED, _S.SHORTLISTED, _S.APPROVAL_REQUIRED, _S.APPROVED,
        _S.PAUSED_OTP, _S.PAUSED_CAPTCHA, _S.PAUSED_USER_INPUT, _S.PAUSED_AUTH_EXPIRED,
        _S.PAUSED_SESSION, _S.PAUSED_LIMIT, _S.RETRY_QUEUED, _S.FAILED,
    }
)


async def attach_saved_tailored(app: Application, resume_repo: Optional[Any]) -> bool:
    """Late-attach the user's saved copy for this job when the application has none and did not opt out.

    Covers a copy saved after the application was created. Returns True when it changed the entity;
    the caller's next save persists it.
    """
    if resume_repo is None or app.tailored_resume_id or app.tailored_opt_out:
        return False
    finder = getattr(resume_repo, "find_saved_tailored_for_job", None)
    if finder is None:
        return False
    ref = await finder(app.user_id, app.job_id)
    ref_id = getattr(ref, "id", None)
    if not isinstance(ref_id, str) or not ref_id:
        return False
    app.tailored_resume_id = ref_id
    return True


class SetResumeChoiceUseCase:
    """The user's explicit per-application choice: send the tailored copy or the master resume."""

    def __init__(self, app_repo: Any, resume_repo: Any):
        self._app_repo = app_repo
        self._resume_repo = resume_repo

    async def execute(self, user_id: str, application_id: str, use_tailored: bool) -> Application:
        app = await self._app_repo.get_by_id(application_id)
        if app is None:
            raise EntityNotFoundException("Application", application_id)
        if app.user_id != user_id:
            raise AuthorizationException("Application does not belong to the authenticated user.")
        if app.workflow_state not in CHOICE_EDITABLE:
            raise ConflictException("The resume can no longer be changed for this application.")
        if use_tailored:
            ref = await self._resume_repo.find_saved_tailored_for_job(user_id, app.job_id)
            if ref is None:
                raise ConflictException("There is no saved tailored resume for this job.")
            app.tailored_resume_id = ref.id
            app.tailored_opt_out = False
        else:
            app.tailored_resume_id = None
            app.tailored_opt_out = True
        app.updated_at = datetime.now(timezone.utc)
        return await self._app_repo.save(app, expected_state=app.workflow_state)
