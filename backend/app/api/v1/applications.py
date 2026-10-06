from typing import Annotated, List, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from app.api.deps import (
    get_ai_gateway,
    get_application_repository,
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
    CreateApplicationDTO,
    ResumeApplicationDTO,
    StopApplicationDTO,
    TakeControlDTO,
)
from app.application.applications.use_cases import (
    ApproveApplicationUseCase,
    CreateApplicationUseCase,
    ExecuteApplicationUseCase,
    GetApplicationUseCase,
    ListApplicationsUseCase,
    ResumeApplicationUseCase,
    StopApplicationUseCase,
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

router = APIRouter(prefix="/applications", tags=["Job Applications & Automation"])


def _to_response_dto(app: Application) -> ApplicationResponseDTO:
    return ApplicationResponseDTO(
        id=app.id,
        user_id=app.user_id,
        job_id=app.job_id,
        resume_id=app.resume_id,
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


@router.get("", response_model=List[ApplicationResponseDTO])
async def list_applications(
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    state: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    use_case = ListApplicationsUseCase(app_repo=app_repo)
    apps = await use_case.execute(
        user_id=current_user.id,
        state=state,
        skip=skip,
        limit=limit,
    )
    return [_to_response_dto(a) for a in apps]


@router.get("/stats", response_model=ApplicationStatsDTO)
async def get_application_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    total = len(await app_repo.list_by_user(user_id=current_user.id, limit=1000))
    applied = await app_repo.count_by_state(current_user.id, WorkflowStateEnum.APPLIED.value)
    paused = (
        await app_repo.count_by_state(current_user.id, WorkflowStateEnum.PAUSED_OTP.value)
        + await app_repo.count_by_state(current_user.id, WorkflowStateEnum.PAUSED_CAPTCHA.value)
        + await app_repo.count_by_state(current_user.id, WorkflowStateEnum.PAUSED_USER_INPUT.value)
    )
    failed = await app_repo.count_by_state(current_user.id, WorkflowStateEnum.FAILED.value)
    approval_required = await app_repo.count_by_state(
        current_user.id, WorkflowStateEnum.APPROVAL_REQUIRED.value
    )

    return ApplicationStatsDTO(
        total=total,
        applied=applied,
        paused=paused,
        failed=failed,
        approval_required=approval_required,
    )


@router.get("/{application_id}", response_model=ApplicationResponseDTO)
async def get_application(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    use_case = GetApplicationUseCase(app_repo=app_repo)
    app = await use_case.execute(application_id=application_id)
    if app.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access.")
    return _to_response_dto(app)


@router.post("", response_model=ApplicationResponseDTO, status_code=status.HTTP_201_CREATED)
async def create_application(
    req: CreateApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
):
    use_case = CreateApplicationUseCase(app_repo=app_repo, job_repo=job_repo)
    app = await use_case.execute(
        user_id=current_user.id,
        job_id=req.job_id,
        resume_id=req.resume_id,
    )
    return _to_response_dto(app)


@router.post("/{application_id}/approve", response_model=ApplicationResponseDTO)
async def approve_application(
    application_id: str,
    req: ApproveApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
):
    execute_use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        resume_repo=resume_repo,
        ai_provider=ai_gateway,
    )
    use_case = ApproveApplicationUseCase(app_repo=app_repo, execute_use_case=execute_use_case)
    app = await use_case.execute(
        application_id=application_id,
        resume_id=req.resume_id,
        auto_execute=req.auto_execute,
    )
    return _to_response_dto(app)


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
):
    execute_use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        resume_repo=resume_repo,
        ai_provider=ai_gateway,
    )
    use_case = ResumeApplicationUseCase(app_repo=app_repo, execute_use_case=execute_use_case)
    app = await use_case.execute(
        application_id=application_id,
        user_input=req.user_input,
    )
    return _to_response_dto(app)


@router.post("/{application_id}/stop", response_model=ApplicationResponseDTO)
async def stop_application(
    application_id: str,
    req: StopApplicationDTO,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
):
    use_case = StopApplicationUseCase(app_repo=app_repo)
    app = await use_case.execute(application_id=application_id, reason=req.reason or "Aborted by user")
    return _to_response_dto(app)


@router.post("/{application_id}/execute", response_model=ApplicationResponseDTO)
async def execute_application(
    application_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    app_repo: Annotated[SqlAlchemyApplicationRepository, Depends(get_application_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
):
    use_case = ExecuteApplicationUseCase(
        app_repo=app_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        resume_repo=resume_repo,
        ai_provider=ai_gateway,
    )
    app = await use_case.execute(application_id=application_id)
    return _to_response_dto(app)
