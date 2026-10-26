import asyncio
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
    get_browser_session_repository,
    get_profile_repository,
    get_resume_repository,
    require_admin,
)
from app.infrastructure.database.repositories.profile_repository import SqlAlchemyResumeRepository
from app.core.config import settings
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
    from app.core.config import settings
    from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchingTaskRepository
    from app.infrastructure.database.repositories.connection_repository import SqlAlchemyBrowserSessionRepository

    async with database.AsyncSessionLocal() as session:
        try:
            session_repo = SqlAlchemyBrowserSessionRepository(session)
            sess_obj = await session_repo.get_by_user_and_platform(user_id, source_type)
            storage_state = sess_obj.encrypted_storage_state if (sess_obj and getattr(sess_obj, "status", "ACTIVE") == "ACTIVE") else None

            use_case = DiscoverJobsUseCase(
                job_repo=SqlAlchemyJobRepository(session),
                job_source_repo=SqlAlchemyJobSourceRepository(session),
                matching_task_repo=SqlAlchemyMatchingTaskRepository(session),
            )
            await use_case.execute(
                user_id=user_id,
                source_type=source_type,
                filters=filters,
                encrypted_storage_state=storage_state,
                headless=settings.BROWSER_HEADLESS,
                auto_evaluate=auto_evaluate,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Background discovery failed for source %s", source_type)


class DiscoverJobsRequest(BaseModel):
    source_type: Optional[str] = "naukri"
    source_types: Optional[List[str]] = None
    roles: List[str] = Field(default_factory=lambda: ["Data Engineer"])
    locations: List[str] = Field(default_factory=lambda: ["Bangalore", "Pune"])
    companies: List[str] = Field(default_factory=list)
    experience: Optional[float] = None
    min_experience: float = 0.0
    max_experience: float = 10.0
    skills: List[str] = Field(default_factory=list)
    resume_id: Optional[str] = None
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
    session_repo: Annotated[Any, Depends(get_browser_session_repository)],
    profile_repo: Annotated[Any, Depends(get_profile_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
):
    # Selected resume resolution and ownership check
    selected_resume = None
    if req.resume_id:
        selected_resume = await resume_repo.get_by_id(req.resume_id)
        if not selected_resume or selected_resume.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Selected resume '{req.resume_id}' not found or does not belong to active user",
            )

    # Grounding with candidate profile & resume skills
    profile = await profile_repo.get_by_user_id(current_user.id)
    resolved_skills = list(req.skills or [])
    if not resolved_skills and selected_resume and selected_resume.raw_text:
        if profile and profile.skills:
            prof_skills = [s.name for s in profile.skills if getattr(s, "name", None)]
            r_text_lower = selected_resume.raw_text.lower()
            resolved_skills = [s for s in prof_skills if s.lower() in r_text_lower]
        if not resolved_skills:
            import re
            tokens = set(re.findall(r'\b[A-Za-z][A-Za-z0-9+#\.\-]{1,20}\b', selected_resume.raw_text))
            common_skills = {"python", "java", "sql", "react", "typescript", "javascript", "docker", "kubernetes", "aws", "gcp", "azure", "c++", "c#", "go", "rust", "scala", "kafka", "spark", "hadoop", "node", "fastapi", "django", "flask", "pytorch", "tensorflow", "pandas", "numpy", "tableau", "powerbi"}
            found = [t for t in tokens if t.lower() in common_skills]
            if found:
                resolved_skills = found[:15]

    if not resolved_skills and profile and profile.skills:
        resolved_skills = [s.name for s in profile.skills if getattr(s, "name", None)]

    exp_val = req.experience
    if exp_val is None:
        if profile and profile.experience_years is not None:
            exp_val = float(profile.experience_years)
        else:
            exp_val = req.min_experience

    roles_val = list(req.roles or [])
    if (not roles_val or roles_val == ["Data Engineer"]) and profile and profile.target_roles:
        p_roles = [r.title for r in profile.target_roles if getattr(r, "title", None)]
        if p_roles:
            roles_val = p_roles

    filters = SearchQueryFilter(
        roles=roles_val,
        companies=req.companies,
        locations=req.locations,
        experience=exp_val,
        min_experience=req.min_experience if req.experience is not None else exp_val,
        max_experience=req.max_experience,
        skills=resolved_skills,
        min_salary=req.min_salary,
        max_days_posted=req.max_days_posted,
        sort_by_date=True,
        strict_experience_match=True,
        strict_role_match=True,
    )

    ALL_SUPPORTED_SOURCES = ["naukri", "linkedin"]

    target_sources: List[str] = []
    if req.source_types and len(req.source_types) > 0:
        target_sources = [s.strip().lower() for s in req.source_types if s.strip()]
    elif req.source_type:
        st_clean = req.source_type.strip().lower()
        if st_clean in ("all", "*"):
            target_sources = list(ALL_SUPPORTED_SOURCES)
        elif "," in st_clean:
            target_sources = [s.strip().lower() for s in st_clean.split(",") if s.strip()]
        else:
            target_sources = [st_clean]
    else:
        target_sources = ["naukri"]

    target_sources = [s for s in target_sources if s in ALL_SUPPORTED_SOURCES] or ["naukri"]

    if req.background:
        await job_repo._session.commit()
        for src in target_sources:
            spawn(
                _discover_in_background(current_user.id, src, filters, req.auto_evaluate),
                name=f"discover-{src}",
            )
        response.status_code = status.HTTP_202_ACCEPTED
        return {"status": "started", "sources": target_sources}

    if len(target_sources) == 1:
        use_case = DiscoverJobsUseCase(
            job_repo=job_repo,
            job_source_repo=source_repo,
            matching_task_repo=task_repo,
        )
        # Retrieve encrypted browser session state if connected
        sess_obj = await session_repo.get_by_user_and_platform(current_user.id, target_sources[0])
        storage_state = sess_obj.encrypted_storage_state if sess_obj else None

        result = await use_case.execute(
            user_id=current_user.id,
            source_type=target_sources[0],
            filters=filters,
            encrypted_storage_state=storage_state,
            headless=settings.BROWSER_HEADLESS,
            auto_evaluate=req.auto_evaluate,
        )
        return result

    # Multi-portal parallel execution with error insulation
    async def run_single_source(src: str):
        try:
            sess_obj = await session_repo.get_by_user_and_platform(current_user.id, src)
            storage_state = sess_obj.encrypted_storage_state if sess_obj else None

            uc = DiscoverJobsUseCase(
                job_repo=job_repo,
                job_source_repo=source_repo,
                matching_task_repo=task_repo,
            )
            return await uc.execute(
                user_id=current_user.id,
                source_type=src,
                filters=filters,
                encrypted_storage_state=storage_state,
                headless=settings.BROWSER_HEADLESS,
                auto_evaluate=req.auto_evaluate,
            )
        except Exception as e:
            logger.warning("Discovery error on portal [%s]: %s", src, e)
            return {
                "source": src,
                "discovered_total": 0,
                "new_jobs_count": 0,
                "filtered_out_count": 0,
                "skipped_duplicates": 0,
                "enqueued_count": 0,
                "evaluation_status": "SKIPPED",
                "jobs": [],
                "error": str(e),
            }

    results = await asyncio.gather(*(run_single_source(s) for s in target_sources))
    total_discovered = sum(r.get("discovered_total", 0) for r in results)
    total_new = sum(r.get("new_jobs_count", 0) for r in results)
    total_filtered = sum(r.get("filtered_out_count", 0) for r in results)
    total_dups = sum(r.get("skipped_duplicates", 0) for r in results)
    total_enqueued = sum(r.get("enqueued_count", 0) for r in results)
    combined_jobs = []
    for r in results:
        combined_jobs.extend(r.get("jobs", []))

    return {
        "source": "all" if len(target_sources) == len(ALL_SUPPORTED_SOURCES) else ",".join(target_sources),
        "sources": target_sources,
        "discovered_total": total_discovered,
        "new_jobs_count": total_new,
        "filtered_out_count": total_filtered,
        "skipped_duplicates": total_dups,
        "enqueued_count": total_enqueued,
        "evaluation_status": "ENQUEUED" if total_enqueued > 0 else "SKIPPED",
        "jobs": combined_jobs,
        "by_platform": {r.get("source"): {"discovered": r.get("discovered_total", 0), "new": r.get("new_jobs_count", 0), "filtered_out": r.get("filtered_out_count", 0)} for r in results},
    }


@router.get("", response_model=PaginatedJobsResponse)
async def list_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    user_state_repo: Annotated[SqlAlchemyUserJobStateRepository, Depends(get_user_job_state_repository)],
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None, description="Target role filter"),
    min_experience: Optional[float] = Query(None, description="Min candidate experience in years"),
    max_experience: Optional[float] = Query(None, description="Max candidate experience in years"),
    location: Optional[str] = Query(None),
    source_id: Optional[str] = Query(None),
    posted_within: Optional[str] = Query(None, description="Filter: 1h, 3h, 6h, 12h, 24h, 3d, 7d, 14d, 30d"),
    freshness_bucket: Optional[str] = Query(None, description="Filter: JUST_NOW, LAST_1_HOUR, LAST_24_HOURS, etc."),
    sort_by: Optional[str] = Query("newest", description="Sort: newest, freshness, salary, relevance"),
    include_dismissed: bool = Query(False, description="Whether to include dismissed jobs"),
):
    exclude_ids = None
    if not include_dismissed:
        exclude_ids = await user_state_repo.list_dismissed_job_ids(current_user.id)

    use_case = ListJobsUseCase(job_repo=job_repo)
    result = await use_case.execute(
        skip=skip,
        limit=limit,
        search=search,
        role=role,
        min_experience=min_experience,
        max_experience=max_experience,
        location=location,
        source_id=source_id,
        posted_within=posted_within,
        freshness_bucket=freshness_bucket,
        sort_by=sort_by,
        exclude_job_ids=exclude_ids,
    )
    items = result.get("items", [])
    if items:
        job_ids = [j.id for j in items]
        states_map = await user_state_repo.get_user_states_for_jobs(current_user.id, job_ids)
        annotated_items = []
        for j in items:
            state = states_map.get(j.id)
            is_dismissed = state.is_dismissed if state else False
            j_dict = j.__dict__.copy() if hasattr(j, "__dict__") else dict(j)
            j_dict["is_saved"] = state.is_saved if state else False
            j_dict["is_dismissed"] = is_dismissed
            annotated_items.append(JobSummaryResponse(**j_dict))
        result["items"] = annotated_items
    else:
        result["items"] = []
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
