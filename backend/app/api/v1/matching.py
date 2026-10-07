from datetime import datetime
from typing import Annotated, Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from app.api.deps import (
    get_ai_gateway,
    get_current_user,
    get_job_repository,
    get_matching_repository,
    get_profile_repository,
    get_resume_repository,
    get_saved_answer_repository,
)
from app.application.matching.use_cases import EvaluateJobMatchUseCase, ListMatchesUseCase
from app.domain.ai.contracts import AIGateway
from app.domain.auth.entities import User
from app.domain.matching.entities import DecisionEnum, MatchRule
from app.infrastructure.database.repositories.job_repository import SqlAlchemyJobRepository
from app.infrastructure.database.repositories.matching_repository import SqlAlchemyMatchResultRepository
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemyResumeRepository,
    SqlAlchemySavedAnswerRepository,
)

router = APIRouter(prefix="/jobs/matches", tags=["Job Matching & Scoring"])


class UpdateMatchingWeightsRequest(BaseModel):
    skills_weight: float = Field(..., ge=0.0, le=1.0)
    semantic_weight: float = Field(..., ge=0.0, le=1.0)
    experience_weight: float = Field(..., ge=0.0, le=1.0)
    role_title_weight: Optional[float] = Field(0.15, ge=0.0, le=1.0)
    location_weight: Optional[float] = Field(0.10, ge=0.0, le=1.0)
    auto_apply_threshold: Optional[float] = Field(90.0, ge=0.0, le=100.0)
    approval_threshold: Optional[float] = Field(75.0, ge=0.0, le=100.0)


class MatchResultResponse(BaseModel):
    id: str
    user_id: str
    job_id: str
    resume_id: Optional[str] = None
    overall_score: float
    hard_filter_passed: bool
    skill_match_score: float
    semantic_score: float
    reasoning_summary: str
    matched_skills: List[str] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    decision: str
    ai_provider_used: str
    created_at: Optional[datetime] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    apply_url: Optional[str] = None
    raw_posted_text: Optional[str] = None


class EvaluateMatchRequest(BaseModel):
    resume_id: Optional[str] = None
    skills_weight: float = 0.35
    experience_weight: float = 0.20
    role_title_weight: float = 0.15
    location_weight: float = 0.10
    auto_apply_threshold: float = 90.0
    approval_threshold: float = 75.0


@router.get("", response_model=List[MatchResultResponse])
async def list_job_matches(
    current_user: Annotated[User, Depends(get_current_user)],
    match_repo: Annotated[SqlAlchemyMatchResultRepository, Depends(get_matching_repository)],
    min_score: Optional[float] = Query(None, ge=0.0, le=100.0),
    decision: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    use_case = ListMatchesUseCase(match_repo=match_repo)
    matches = await use_case.execute(
        user_id=current_user.id,
        min_score=min_score,
        decision=decision,
        skip=skip,
        limit=limit,
    )
    return [
        MatchResultResponse(
            id=m.id,
            user_id=m.user_id,
            job_id=m.job_id,
            resume_id=m.resume_id,
            overall_score=m.overall_score,
            hard_filter_passed=m.hard_filter_passed,
            skill_match_score=m.skill_match_score,
            semantic_score=m.semantic_score,
            reasoning_summary=m.reasoning_summary,
            matched_skills=m.matched_skills,
            missing_skills=m.missing_skills,
            decision=m.decision.value,
            ai_provider_used=m.ai_provider_used,
            created_at=m.created_at,
            job_title=m.job_title,
            company=m.company,
            location=m.location,
            apply_url=m.apply_url,
            raw_posted_text=m.raw_posted_text,
        )
        for m in matches
    ]


@router.post("/evaluate-all", response_model=List[MatchResultResponse], status_code=status.HTTP_200_OK)
async def evaluate_all_discovered_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    match_repo: Annotated[SqlAlchemyMatchResultRepository, Depends(get_matching_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    saved_answer_repo: Annotated[SqlAlchemySavedAnswerRepository, Depends(get_saved_answer_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
    limit: int = Query(25, ge=1, le=100),
):
    from app.application.matching.use_cases import BatchEvaluateJobsUseCase, EvaluateJobMatchUseCase
    eval_use_case = EvaluateJobMatchUseCase(
        profile_repo=profile_repo,
        job_repo=job_repo,
        match_repo=match_repo,
        resume_repo=resume_repo,
        ai_gateway=ai_gateway,
        saved_answer_repo=saved_answer_repo,
    )
    batch_use_case = BatchEvaluateJobsUseCase(
        evaluate_use_case=eval_use_case,
        job_repo=job_repo,
    )
    matches = await batch_use_case.execute(user_id=current_user.id, limit=limit)
    return [
        MatchResultResponse(
            id=m.id,
            user_id=m.user_id,
            job_id=m.job_id,
            resume_id=m.resume_id,
            overall_score=m.overall_score,
            hard_filter_passed=m.hard_filter_passed,
            skill_match_score=m.skill_match_score,
            semantic_score=m.semantic_score,
            reasoning_summary=m.reasoning_summary,
            matched_skills=m.matched_skills,
            missing_skills=m.missing_skills,
            decision=m.decision.value,
            ai_provider_used=m.ai_provider_used,
            created_at=m.created_at,
            job_title=m.job_title,
            company=m.company,
            location=m.location,
            apply_url=m.apply_url,
            raw_posted_text=m.raw_posted_text,
        )
        for m in matches
    ]


@router.post("/{job_id}/evaluate", response_model=MatchResultResponse, status_code=status.HTTP_200_OK)
async def evaluate_job_match(
    job_id: str,
    req: EvaluateMatchRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
    job_repo: Annotated[SqlAlchemyJobRepository, Depends(get_job_repository)],
    match_repo: Annotated[SqlAlchemyMatchResultRepository, Depends(get_matching_repository)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)],
):
    rule = MatchRule(
        skills_weight=req.skills_weight,
        experience_weight=req.experience_weight,
        role_title_weight=req.role_title_weight,
        location_weight=req.location_weight,
        auto_apply_threshold=req.auto_apply_threshold,
        approval_threshold=req.approval_threshold,
    )

    use_case = EvaluateJobMatchUseCase(
        profile_repo=profile_repo,
        job_repo=job_repo,
        match_repo=match_repo,
        resume_repo=resume_repo,
        ai_gateway=ai_gateway,
    )

    result = await use_case.execute(
        user_id=current_user.id,
        job_id=job_id,
        resume_id=req.resume_id,
        custom_rule=rule,
    )

    return MatchResultResponse(
        id=result.id,
        user_id=result.user_id,
        job_id=result.job_id,
        resume_id=result.resume_id,
        overall_score=result.overall_score,
        hard_filter_passed=result.hard_filter_passed,
        skill_match_score=result.skill_match_score,
        semantic_score=result.semantic_score,
        reasoning_summary=result.reasoning_summary,
        matched_skills=result.matched_skills,
        missing_skills=result.missing_skills,
        decision=result.decision.value,
        ai_provider_used=result.ai_provider_used,
        created_at=result.created_at,
        job_title=result.job_title,
        company=result.company,
        location=result.location,
        apply_url=result.apply_url,
        raw_posted_text=result.raw_posted_text,
    )


@router.post("/weights", status_code=status.HTTP_200_OK)
async def update_matching_weights(
    req: UpdateMatchingWeightsRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    saved_answer_repo: Annotated[SqlAlchemySavedAnswerRepository, Depends(get_saved_answer_repository)],
):
    """Saves tuned matching cascade weights for the current user."""
    import json
    import uuid
    from app.domain.profile.entities import SavedAnswer

    payload = {
        "skills_weight": req.skills_weight,
        "semantic_weight": req.semantic_weight,
        "experience_weight": req.experience_weight,
        "role_title_weight": req.role_title_weight,
        "location_weight": req.location_weight,
        "auto_apply_threshold": req.auto_apply_threshold,
        "approval_threshold": req.approval_threshold,
    }

    existing = await saved_answer_repo.find_by_intent(current_user.id, "matching_weights")
    if existing:
        existing.answer_text = json.dumps(payload)
        existing.is_verified = True
        await saved_answer_repo.save(existing)
    else:
        new_answer = SavedAnswer(
            id=str(uuid.uuid4()),
            user_id=current_user.id,
            canonical_intent="matching_weights",
            question_pattern="user_matching_weights",
            answer_text=json.dumps(payload),
            is_verified=True,
        )
        await saved_answer_repo.save(new_answer)

    return {
        "status": "success",
        "message": "AI matching weights updated and persisted successfully.",
        "weights": payload,
    }


@router.get("/weights", status_code=status.HTTP_200_OK)
async def get_matching_weights(
    current_user: Annotated[User, Depends(get_current_user)],
    saved_answer_repo: Annotated[SqlAlchemySavedAnswerRepository, Depends(get_saved_answer_repository)],
):
    """Retrieves current tuned matching cascade weights for the current user."""
    import json
    existing = await saved_answer_repo.find_by_intent(current_user.id, "matching_weights")
    if existing and existing.answer_text:
        try:
            return {"weights": json.loads(existing.answer_text)}
        except Exception:
            pass
    return {
        "weights": {
            "skills_weight": 0.35,
            "semantic_weight": 0.25,
            "experience_weight": 0.20,
            "role_title_weight": 0.15,
            "location_weight": 0.10,
            "auto_apply_threshold": 90.0,
            "approval_threshold": 75.0,
        }
    }


matching_weights_alias_router = APIRouter(prefix="/matching", tags=["Job Matching & Scoring"])
matching_weights_alias_router.add_api_route("/weights", update_matching_weights, methods=["POST"], status_code=status.HTTP_200_OK)
matching_weights_alias_router.add_api_route("/weights", get_matching_weights, methods=["GET"], status_code=status.HTTP_200_OK)
