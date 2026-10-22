import os
from pathlib import Path
from typing import Annotated, Any, List, Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse
from app.core.config import settings
from app.api.deps import (
    get_execute_application_use_case,
    get_ai_gateway,
    get_application_repository,
    get_campaign_repository,
    get_connection_repository,
    get_current_user,
    get_job_repository,
    get_profile_repository,
    get_resume_repository,
)
from app.application.applications.dtos import (
    ApplicationQuestionDTO,
    ApplicationResponseDTO,
    ApplicationStatsDTO,
    ApproveApplicationDTO,
    BatchQueueApplicationsDTO,
    CreateApplicationDTO,
    PaginatedApplicationsDTO,
    ReconcileApplicationDTO,
    ResumeChoiceDTO,
    ResumeApplicationDTO,
    StopApplicationDTO,
    TakeControlDTO,
)
from app.application.applications.deferred import DeferredExecuteUseCase
from app.application.applications.use_cases import (
    ApproveApplicationUseCase,
    CreateApplicationUseCase,
    ExecuteApplicationUseCase,
    GetApplicationUseCase,
    ListApplicationsUseCase,
    ReconcileApplicationUseCase,
    ResumeApplicationUseCase,
    RetryApplicationUseCase,
    StopApplicationUseCase,
)
from app.core.exceptions import (
    AuthorizationException,
    EntityNotFoundException,
    ValidationException,
)
from app.domain.ai.contracts import AIGateway
from app.domain.applications.entities import Application, WorkflowStateEnum
from app.domain.auth.entities import User
from app.infrastructure.database.repositories.application_repository import SqlAlchemyApplicationRepository
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemyResumeRepository,
)

from app.application.background import spawn

logger = logging.getLogger("app.api.applications")
router = APIRouter(prefix="/applications", tags=["Job Applications & Automation"])


def _to_response_dto(app: Application) -> ApplicationResponseDTO:
    return ApplicationResponseDTO(
        id=app.id,
        user_id=app.user_id,
        job_id=app.job_id,
        resume_id=app.resume_id,
        tailored_resume_id=app.tailored_resume_id,
        tailored_opt_out=bool(app.tailored_opt_out),
        idempotency_key=app.idempotency_key,
        workflow_state=app.workflow_state,
        applied_at=app.applied_at,
        failure_reason=app.failure_reason,
        trace_file_path=app.trace_file_path,
        screenshot_file_path=app.screenshot_file_path,
        job_title=app.job_title,
        company=app.company,
        location=app.location,
        min_experience_years=app.min_experience_years,
        max_experience_years=app.max_experience_years,
        min_salary=app.min_salary,
        max_salary=app.max_salary,
        salary_currency=app.salary_currency,
        apply_url=app.apply_url,
        platform=app.platform,
        match_score=app.match_score,
        retry_count=app.retry_count or 0,
        error_category=app.error_category,
        next_retry_at=app.next_retry_at,
        created_at=app.created_at,
        updated_at=app.updated_at,
        questions=[
            ApplicationQuestionDTO(
                id=q.id,
                question_text=q.question_text,
                canonical_intent=q.canonical_intent,
                answer_provided=q.answer_provided,
                answered_by=q.answered_by,
                confidence_score=q.confidence_score,
            )
            for q in app.questions
        ],
    )


async def _get_authorized_app(
    application_id: str,
    user_id: str,
    app_repo: SqlAlchemyApplicationRepository,
    current_user: Optional[User] = None,
) -> Application:
    app = await app_repo.get_by_id(application_id)
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application [{application_id}] not found.",
        )
    is_admin = bool(current_user and getattr(current_user, "is_superuser", False))
    if app.user_id != user_id and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized access to this application record.",
        )
    return app


@router.get("", response_model=PaginatedApplicationsDTO)
async def list_applications(
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    state: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    skip: Optional[int] = Query(None, ge=0),
    limit: Optional[int] = Query(None, ge=1, le=1000),
):
    if skip is not None:
        eff_skip = skip
        eff_limit = limit or page_size
        eff_page = (eff_skip // eff_limit) + 1
        eff_page_size = eff_limit
    else:
        eff_page = page
        eff_page_size = page_size
        eff_skip = (page - 1) * page_size
        eff_limit = page_size

    use_case = ListApplicationsUseCase(app_repo=app_repo)
    apps, total_count = await use_case.execute(
        user_id=current_user.id,
        state=state,
        skip=eff_skip,
        limit=eff_limit,
    )
    total_pages = (total_count + eff_page_size - 1) // eff_page_size if total_count > 0 else 1

    return PaginatedApplicationsDTO(
        items=[_to_response_dto(a) for a in apps],
        total=total_count,
        page=eff_page,
        page_size=eff_page_size,
        total_pages=total_pages,
    )


@router.get("/stats", response_model=ApplicationStatsDTO)
async def get_application_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    stats = await app_repo.get_aggregate_stats(current_user.id)
    return ApplicationStatsDTO(**stats)


@router.get("/applied-map", response_model=dict[str, dict[str, Optional[str]]])
async def get_applied_jobs_map(
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    """Returns a compact mapping of job_id -> {status, applied_at} for all applications belonging to current user."""
    return await app_repo.get_applied_job_map(current_user.id)


@router.get("/{application_id}", response_model=ApplicationResponseDTO)
async def get_application(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    app = await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    return _to_response_dto(app)


@router.put("/{application_id}/resume-choice", response_model=ApplicationResponseDTO)
async def set_resume_choice(
    application_id: str,
    req: ResumeChoiceDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
):
    """Choose whether this application sends the saved tailored copy or the master resume."""
    from app.application.applications.tailored_choice import SetResumeChoiceUseCase

    await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    saved = await SetResumeChoiceUseCase(app_repo, resume_repo).execute(current_user.id, application_id, req.use_tailored)
    return _to_response_dto(saved)


@router.get("/{application_id}/screenshot")
async def get_application_screenshot(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    app = await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    if not app.screenshot_file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Screenshot artifact not found.",
        )

    # Path Traversal Defense (CWE-22): Jail path strictly within storage root and approved screenshots directory
    storage_root = Path(settings.STORAGE_DIR).resolve()
    screenshots_root = (storage_root / "screenshots").resolve()
    resumes_root = (storage_root / "resumes").resolve()
    raw_path = Path(app.screenshot_file_path)

    # Canonical path resolution
    if raw_path.is_absolute():
        resolved_path = raw_path.resolve()
    else:
        # Check if raw_path is relative to cwd and already within storage_root (e.g. "./storage/...")
        cwd_cand = raw_path.resolve()
        try:
            cwd_cand.relative_to(storage_root)
            resolved_path = cwd_cand
        except ValueError:
            # Check if (storage_root / raw_path) target was specified (e.g. "screenshots/..." or "resumes/...")
            storage_cand = (storage_root / raw_path).resolve()
            if (
                len(raw_path.parts) > 1
                or raw_path.parts[0] in ("screenshots", "resumes", "traces", "browser_profiles")
            ):
                resolved_path = storage_cand
            else:
                resolved_path = (screenshots_root / raw_path).resolve()

    # Boundary check 1: Strict isolation against resumes or sensitive subtrees
    try:
        resolved_path.relative_to(resumes_root)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to artifact outside storage root is forbidden (must be within approved screenshots directory).",
        )
    except ValueError:
        pass

    # Boundary check 2: Strict confinement to screenshots directory
    try:
        resolved_path.relative_to(screenshots_root)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to artifact outside storage root is forbidden (must be within approved screenshots directory).",
        )

    if not resolved_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Screenshot artifact not found on disk.",
        )

    if resolved_path.suffix.lower() not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid screenshot artifact format.",
        )

    ext = resolved_path.suffix.lower().lstrip(".")
    media_type = f"image/{ext}" if ext != "jpg" else "image/jpeg"
    return FileResponse(
        str(resolved_path),
        media_type=media_type,
        filename=f"screenshot_{application_id}{resolved_path.suffix.lower()}",
    )


@router.post("", response_model=ApplicationResponseDTO, status_code=status.HTTP_201_CREATED)
async def create_application(
    req: CreateApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    campaign_repo: Annotated[Any, Depends(get_campaign_repository)],
    conn_repo: Annotated[Any, Depends(get_connection_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
):
    from app.application.applications.application_orchestrator import ApplicationOrchestrator
    from app.application.applications.commands import ApplicationSource, QueueApplicationCommand

    exec_uc = execute_application_uc
    orchestrator = ApplicationOrchestrator(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        resume_repo=resume_repo,
        campaign_repo=campaign_repo,
        connection_repo=conn_repo,
        execute_use_case=exec_uc,
    )

    try:
        source_enum = ApplicationSource(req.source) if req.source else ApplicationSource.DIRECT_APPLY
    except Exception:
        source_enum = ApplicationSource.DIRECT_APPLY

    cmd = QueueApplicationCommand(
        user_id=current_user.id,
        job_id=req.job_id,
        source=source_enum,
        campaign_id=req.campaign_id,
        resume_id=req.resume_id,
        auto_execute=req.auto_execute,
        use_tailored=req.use_tailored,
    )
    result = await orchestrator.queue_application(cmd)
    if not result.is_queued or not result.application:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{result.error_code}: {result.error_message}",
        )
    return _to_response_dto(result.application)


@router.post("/batch-queue", status_code=status.HTTP_201_CREATED)
async def batch_queue_applications(
    req: BatchQueueApplicationsDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    campaign_repo: Annotated[Any, Depends(get_campaign_repository)],
    conn_repo: Annotated[Any, Depends(get_connection_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
):
    from app.application.applications.application_orchestrator import ApplicationOrchestrator
    from app.application.applications.commands import ApplicationSource, BatchQueueApplicationCommand

    exec_uc = execute_application_uc
    orchestrator = ApplicationOrchestrator(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        resume_repo=resume_repo,
        campaign_repo=campaign_repo,
        connection_repo=conn_repo,
        execute_use_case=exec_uc,
    )

    try:
        source_enum = ApplicationSource(req.source) if req.source else ApplicationSource.CAMPAIGN
    except Exception:
        source_enum = ApplicationSource.CAMPAIGN

    cmd = BatchQueueApplicationCommand(
        user_id=current_user.id,
        job_ids=req.job_ids,
        source=source_enum,
        campaign_id=req.campaign_id,
        resume_id=req.resume_id,
        auto_execute=req.auto_execute,
        use_tailored=req.use_tailored,
    )
    result = await orchestrator.batch_queue_applications(cmd)
    return {
        "total_requested": result.total_requested,
        "queued_count": result.queued_count,
        "skipped_count": result.skipped_count,
        "results": [
            {
                "job_id": cmd.job_ids[i] if i < len(cmd.job_ids) else None,
                "is_queued": r.is_queued,
                "status": r.status,
                "error_code": r.error_code,
                "error_message": r.error_message,
                "application_id": r.application.id if r.application else None,
            }
            for i, r in enumerate(result.results)
        ],
    }


@router.post("/{application_id}/approve", response_model=ApplicationResponseDTO)
async def approve_application(
    application_id: str,
    req: ApproveApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    campaign_repo: Annotated[Any, Depends(get_campaign_repository)],
    conn_repo: Annotated[Any, Depends(get_connection_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
):
    await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    execute_use_case = execute_application_uc
    use_case = ApproveApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=execute_use_case,
        job_repo=job_repo,
        resume_repo=resume_repo,
        campaign_repo=campaign_repo,
        connection_repo=conn_repo,
    )
    app = await use_case.execute(
        application_id=application_id,
        resume_id=req.resume_id,
        auto_execute=req.auto_execute,
    )
    return _to_response_dto(app)


@router.post("/{application_id}/retry", response_model=ApplicationResponseDTO)
async def retry_application(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    campaign_repo: Annotated[Any, Depends(get_campaign_repository)],
    conn_repo: Annotated[Any, Depends(get_connection_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
):
    await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    execute_use_case = execute_application_uc
    use_case = RetryApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=execute_use_case,
        job_repo=job_repo,
        resume_repo=resume_repo,
        campaign_repo=campaign_repo,
        connection_repo=conn_repo,
    )
    is_admin = bool(getattr(current_user, "is_superuser", False))
    try:
        app = await use_case.execute(application_id=application_id, user_id=current_user.id, is_admin=is_admin)
        return _to_response_dto(app)
    except AuthorizationException:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access to this application record.")
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{application_id}/resume", response_model=ApplicationResponseDTO)
async def resume_application(
    application_id: str,
    req: ResumeApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
    response: Response,
    wait: bool = Query(False, description="true = run the browser flow inside this request"),
):
    """Starts the browser flow in the background (202) unless wait=true."""
    await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    execute_use_case = _build_executor(app_repo, execute_application_uc, wait)
    use_case = ResumeApplicationUseCase(app_repo=app_repo, execute_use_case=execute_use_case)
    app = await use_case.execute(
        application_id=application_id,
        user_input=req.user_input,
    )
    if getattr(execute_use_case, "scheduled", False):
        response.status_code = status.HTTP_202_ACCEPTED
    return _to_response_dto(app)


@router.post("/{application_id}/stop", response_model=ApplicationResponseDTO)
async def stop_application(
    application_id: str,
    req: StopApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    use_case = StopApplicationUseCase(app_repo=app_repo)
    app = await use_case.execute(application_id=application_id, reason=req.reason or "Aborted by user")
    return _to_response_dto(app)


@router.post("/{application_id}/reconcile", response_model=ApplicationResponseDTO)
async def reconcile_application(
    application_id: str,
    req: ReconcileApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    campaign_repo: Annotated[Any, Depends(get_campaign_repository)],
    conn_repo: Annotated[Any, Depends(get_connection_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
    response: Response,
    wait: bool = Query(False, description="true = run a retry inside this request"),
):
    """A retry starts in the background (202) unless wait=true. Other actions finish immediately."""
    await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    execute_use_case = _build_executor(app_repo, execute_application_uc, wait)
    use_case = ReconcileApplicationUseCase(
        app_repo=app_repo,
        execute_use_case=execute_use_case,
        job_repo=job_repo,
        resume_repo=resume_repo,
        campaign_repo=campaign_repo,
        connection_repo=conn_repo,
    )
    is_admin = bool(getattr(current_user, "is_superuser", False))
    try:
        app = await use_case.execute(
            application_id=application_id,
            action=req.action,
            notes=req.notes,
            user_id=current_user.id,
            is_admin=is_admin,
        )
        if getattr(execute_use_case, "scheduled", False):
            response.status_code = status.HTTP_202_ACCEPTED
        return _to_response_dto(app)
    except AuthorizationException:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access to this application record.")
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except EntityNotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


async def _execute_in_background(application_id: str) -> None:
    """Runs the browser flow on its own database session, after the request has returned."""
    from app.infrastructure.execution_factory import build_execute_application_use_case
    from app.core import database

    async with database.AsyncSessionLocal() as session:
        try:
            use_case = build_execute_application_use_case(session, commit_each_write=True)
            await use_case.execute(application_id=application_id)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Background execution failed for application %s", application_id)


def _build_executor(
    app_repo: SqlAlchemyApplicationRepository,
    real_use_case: ExecuteApplicationUseCase,
    wait: bool,
):
    """Real use case when the caller asked to wait, otherwise one that starts the run in the background."""
    if wait:
        return real_use_case

    def _start(application_id: str) -> None:
        spawn(_execute_in_background(application_id), name=f"execute-{application_id}")

    return DeferredExecuteUseCase(app_repo=app_repo, commit=app_repo._session.commit, start_in_background=_start)


@router.post("/{application_id}/execute", response_model=ApplicationResponseDTO)
async def execute_application(
    application_id: str,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    execute_application_uc: Annotated[ExecuteApplicationUseCase, Depends(get_execute_application_use_case)],
    wait: bool = Query(False, description="true = run inside this request and return the final state"),
):
    """By default the browser flow starts in the background (202). Poll the application for its state."""
    application = await _get_authorized_app(application_id, current_user.id, app_repo, current_user=current_user)
    if wait:
        app = await execute_application_uc.execute(application_id=application_id)
        return _to_response_dto(app)

    # Commit first so the background session sees the application, then let the run start.
    await app_repo._session.commit()
    spawn(_execute_in_background(application_id), name=f"execute-{application_id}")
    response.status_code = status.HTTP_202_ACCEPTED
    return _to_response_dto(application)
