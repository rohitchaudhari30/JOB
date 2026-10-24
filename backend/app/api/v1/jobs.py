from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from app.api.deps import (
    get_current_user,
    get_job_repository,
    get_job_source_repository,
    get_matching_task_repository,
    get_user_job_state_repository,
    require_admin,
)
from app.application.background import spawn
from app.application.jobs.use_cases import (
    DiscoverJobsUseCase,
    GetJobDetailsUseCase,
    ListJobsUseCase,
)
from app.domain.auth.entities import User
from app.domain.jobs.entities import SearchQueryFilter
from app.infrastructure.database.repositories.job_repository import (
    SqlAlchemyJobRepository,
    SqlAlchemyJobSourceRepository,
)
from app.infrastructure.database.repositories.user_job_state_repository import (
    SqlAlchemyUserJobStateRepository,
)

logger = logging.getLogger("app.api.jobs")
router = APIRouter(prefix="/jobs", tags=["Job Catalog & Discovery"])


async def _discover_in_background(user_id: str, source_type: str, filters: SearchQueryFilter, auto_evaluate: bool) -> None:
    """Runs discovery on its own database session so the request does not have to wait for the browser."""
    from app.core import database
    from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchingTaskRepository

    async with database.AsyncSessionLocal() as session:
        try:
            use_case = DiscoverJobsUseCase(
                job_repo=SqlAlchemyJobRepository(session),
                job_source_repo=SqlAlchemyJobSourceRepository(session),
                matching_task_repo=SqlAlchemyMatchingTaskRepository(session),
            )
            await use_case.execute(
                user_id=user_id,
                source_type=source_type,
                filters=filters,
                headless=True,
                auto_evaluate=auto_evaluate,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Background discovery failed for source %s", source_type)


class DiscoverJobsRequest(BaseModel):
    source_type: str = "naukri"
    roles: List[str] = Field(default_factory=lambda: ["Data Engineer"])
    locations: List[str] = Field(default_factory=lambda: ["Bangalore", "Pune"])
    companies: List[str] = Field(default_factory=list)  # needed for Lever/Greenhouse/Ashby/Workday
    experience: Optional[float] = None
    min_experience: float = 0.0
    max_experience: float = 10.0
    min_salary: Optional[float] = None
    max_days_posted: int = 7
    auto_evaluate: bool = False
    background: bool = False


class JobSummaryResponse(BaseModel):
    id: str
    source_id: str
    source_type: Optional[str] = "naukri"
    external_job_id: str
    title: str
    company: str
    location: str
    min_experience_years: float
    max_experience_years: float
    min_salary: Optional[float] = None
    max_salary: Optional[float] = None
    salary_currency: str = "INR"
    employment_type: str = "Full-time"
    apply_url: str
    canonical_job_key: Optional[str] = None
    is_active: bool = True
    posted_at: Optional[datetime] = None
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    raw_posted_text: Optional[str] = None
    posted_at_precision: str = "UNKNOWN"
    posted_at_source: Optional[str] = None
    freshness_bucket: str = "UNKNOWN"
    freshness_score: float = 0.0
    lifecycle_state: str = "ACTIVE"
    last_verified_at: Optional[datetime] = None
    is_saved: bool = False
    is_dismissed: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class JobDetailResponse(JobSummaryResponse):
    raw_description: str
    parsed_requirements: Dict[str, Any] = Field(default_factory=dict)


class PaginatedJobsResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[JobSummaryResponse]


@router.post("/discover", status_code=status.HTTP_200_OK)
async def discover_jobs(
    req: DiscoverJobsRequest,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    source_repo: Annotated[SqlAlchemyJobSourceRepository, Depends(get_job_source_repository)],
    task_repo: Annotated[Any, Depends(get_matching_task_repository)],
):
    exp_val = req.experience if req.experience is not None else req.min_experience
    filters = SearchQueryFilter(
        roles=req.roles,
        companies=req.companies,
        locations=req.locations,
        experience=exp_val,
        min_experience=req.min_experience,
        max_experience=req.max_experience,
        min_salary=req.min_salary,
        max_days_posted=req.max_days_posted,
        sort_by_date=True,
    )

    if req.background:
        await job_repo._session.commit()
        spawn(
            _discover_in_background(current_user.id, req.source_type, filters, req.auto_evaluate),
            name=f"discover-{req.source_type}",
        )
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": "started", "source": req.source_type}

    use_case = DiscoverJobsUseCase(
        job_repo=job_repo,
        job_source_repo=source_repo,
        matching_task_repo=task_repo,
    )
    result = await use_case.execute(
        user_id=current_user.id,
        source_type=req.source_type,
        filters=filters,
        headless=True,
        auto_evaluate=req.auto_evaluate,
    )
    return result


@router.get("", response_model=PaginatedJobsResponse)
async def list_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    source_id: Optional[str] = Query(None),
    posted_within: Optional[str] = Query(None, description="Filter: 1h, 3h, 6h, 12h, 24h, 3d, 7d, 14d, 30d"),
    freshness_bucket: Optional[str] = Query(None, description="Filter: JUST_NOW, LAST_1_HOUR, LAST_24_HOURS, etc."),
    sort_by: Optional[str] = Query("newest", description="Sort: newest, freshness, salary, relevance"),
    include_dismissed: bool = Query(False, description="Whether to include dismissed jobs"),
):
    use_case = ListJobsUseCase(job_repo=job_repo)
    result = await use_case.execute(
        skip=skip,
        limit=limit,
        search=search,
        location=location,
        source_id=source_id,
        posted_within=posted_within,
        freshness_bucket=freshness_bucket,
        sort_by=sort_by,
    )
    items = result.get("items", [])
    if items:
        job_ids = [j.id for j in items]
        states_map = await user_state_repo.get_user_states_for_jobs(current_user.id, job_ids)
        annotated_items = []
        for j in items:
            state = states_map.get(j.id)
            is_dismissed = state.is_dismissed if state else False
            if not include_dismissed and is_dismissed:
                continue
            j_dict = j.__dict__.copy() if hasattr(j, "__dict__") else dict(j)
            j_dict["is_saved"] = state.is_saved if state else False
            j_dict["is_dismissed"] = is_dismissed
            annotated_items.append(JobSummaryResponse(**j_dict))
        result["items"] = annotated_items
        result["total"] = len(annotated_items) if not include_dismissed else result.get("total", len(annotated_items))
    return result


@router.get("/user/saved", response_model=PaginatedJobsResponse)
async def list_saved_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    jobs = await user_state_repo.list_saved_jobs(current_user.id, skip=skip, limit=limit)
    items = []
    for j in jobs:
        j_dict = j.__dict__.copy() if hasattr(j, "__dict__") else dict(j)
        j_dict["is_saved"] = True
        j_dict["is_dismissed"] = False
        items.append(JobSummaryResponse(**j_dict))
    return PaginatedJobsResponse(total=len(items), skip=skip, limit=limit, items=items)


@router.get("/{job_id}", response_model=JobDetailResponse)
async def get_job_details(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
):
    use_case = GetJobDetailsUseCase(job_repo=job_repo)
    job = await use_case.execute(job_id)
    state = await user_state_repo.get_state(current_user.id, job_id)
    j_dict = job.__dict__.copy() if hasattr(job, "__dict__") else dict(job)
    j_dict["is_saved"] = state.is_saved if state else False
    j_dict["is_dismissed"] = state.is_dismissed if state else False
    return JobDetailResponse(**j_dict)


@router.post("/{job_id}/save", response_model=Dict[str, Any])
async def save_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
):
    state = await user_state_repo.set_saved(current_user.id, job_id, True)
    return {"status": "saved", "job_id": job_id, "is_saved": state.is_saved}


@router.delete("/{job_id}/save", response_model=Dict[str, Any])
async def unsave_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
):
    state = await user_state_repo.set_saved(current_user.id, job_id, False)
    return {"status": "unsaved", "job_id": job_id, "is_saved": state.is_saved}


@router.post("/{job_id}/dismiss", response_model=Dict[str, Any])
async def dismiss_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
):
    state = await user_state_repo.set_dismissed(current_user.id, job_id, True)
    return {"status": "dismissed", "job_id": job_id, "is_dismissed": state.is_dismissed}


@router.delete("/{job_id}/dismiss", response_model=Dict[str, Any])
async def undismiss_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
):
    state = await user_state_repo.set_dismissed(current_user.id, job_id, False)
    return {"status": "undismissed", "job_id": job_id, "is_dismissed": state.is_dismissed}


@router.post("/retention/sweep", response_model=Dict[str, Any])
async def trigger_retention_sweep(
    current_user: Annotated[User, Depends(require_admin)],
    dry_run: bool = Query(False, description="Preview actions without committing changes"),
    batch_size: Optional[int] = Query(None, ge=1, le=1000),
):
    from app.workers.job_retention_worker import run_job_retention_sweep
    summary = await run_job_retention_sweep(batch_size=batch_size, dry_run=dry_run)
    return summary


@router.delete("/{job_id}", status_code=status.HTTP_200_OK)
async def delete_job(
    job_id: str,
    current_user: Annotated[User, Depends(require_admin)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
):
    from app.application.jobs.use_cases import DeleteJobUseCase
    use_case = DeleteJobUseCase(job_repo=job_repo)
    await use_case.execute(job_id)
    return {"status": "deleted", "job_id": job_id}


@router.delete("", status_code=status.HTTP_200_OK)
async def clear_jobs(
    current_user: Annotated[User, Depends(require_admin)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    source_type: Optional[str] = Query(None, description="Optional platform filter to clear (e.g. 'naukri', 'linkedin')"),
):
    from app.application.jobs.use_cases import ClearJobsUseCase
    use_case = ClearJobsUseCase(job_repo=job_repo)
    count = await use_case.execute(source_type=source_type)
    return {"status": "cleared", "deleted_count": count}
