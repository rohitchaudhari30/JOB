from datetime import date
from typing import Annotated, Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.api.deps import get_current_user, get_profile_repository, get_saved_answer_repository
from app.application.profile.use_cases import (
    AddEducationUseCase,
    AddExperienceUseCase,
    GetProfileUseCase,
    ManageSavedAnswersUseCase,
    SyncSkillsUseCase,
    UpdateProfileUseCase,
)
from app.domain.auth.entities import User
from app.infrastructure.database.repositories.profile_repository import (
    SqlAlchemyProfileRepository,
    SqlAlchemySavedAnswerRepository,
)

router = APIRouter(prefix="/profile", tags=["Candidate Profile"])


class ExperienceSchema(BaseModel):
    id: str | None = None
    company_name: str
    title: str
    location: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_current: bool = False
    description: str | None = None


class EducationSchema(BaseModel):
    id: str | None = None
    institution: str
    degree: str
    field_of_study: str | None = None
    start_year: int | None = None
    end_year: int | None = None
    grade: str | None = None


class SkillSchema(BaseModel):
    id: str | None = None
    skill_name: str
    years_experience: float = 0.0
    is_primary: bool = False


class ProfileUpdateSchema(BaseModel):
    headline: str | None = None
    summary: str | None = None
    phone: str | None = None
    location: str | None = None
    current_ctc: float | None = None
    expected_ctc: float | None = None
    currency: str = "INR"
    notice_period_days: int = 30
    total_experience_months: int = 0
    work_authorization: str | None = None
    relocation_preference: bool = True
    remote_preference: str = "any"
    # Optional lists. When a list is sent it REPLACES what is stored;
    # when it is left out, the stored list is untouched.
    skills: List[SkillSchema] | None = None
    experiences: List[ExperienceSchema] | None = None
    educations: List[EducationSchema] | None = None


class ProfileResponse(BaseModel):
    id: str
    user_id: str
    headline: str | None = None
    summary: str | None = None
    phone: str | None = None
    location: str | None = None
    current_ctc: float | None = None
    expected_ctc: float | None = None
    currency: str = "INR"
    notice_period_days: int = 30
    total_experience_months: int = 0
    work_authorization: str | None = None
    relocation_preference: bool = True
    remote_preference: str = "any"
    experiences: List[ExperienceSchema] = []
    educations: List[EducationSchema] = []
    skills: List[SkillSchema] = []


class SavedAnswerSchema(BaseModel):
    id: str | None = None
    canonical_intent: str
    question_pattern: str
    answer_text: str
    is_verified: bool = True


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    use_case = GetProfileUseCase(profile_repo)
    profile = await use_case.execute(current_user.id)
    return profile


@router.put("", response_model=ProfileResponse)
async def update_profile(
    req: ProfileUpdateSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    use_case = UpdateProfileUseCase(profile_repo)
    updated = await use_case.execute(current_user.id, req.model_dump(exclude_unset=True))
    return updated


@router.post("/experiences", response_model=ExperienceSchema, status_code=status.HTTP_201_CREATED)
async def add_experience(
    req: ExperienceSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    use_case = AddExperienceUseCase(profile_repo)
    exp = await use_case.execute(current_user.id, req.model_dump())
    return exp


@router.delete("/experiences/{exp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_experience(
    exp_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    profile = await profile_repo.get_by_user_id(current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    success = await profile_repo.delete_experience(exp_id, profile.id)
    if not success:
        raise HTTPException(status_code=404, detail="Experience not found.")


@router.post("/educations", response_model=EducationSchema, status_code=status.HTTP_201_CREATED)
async def add_education(
    req: EducationSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    use_case = AddEducationUseCase(profile_repo)
    edu = await use_case.execute(current_user.id, req.model_dump())
    return edu


@router.delete("/educations/{edu_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_education(
    edu_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    profile = await profile_repo.get_by_user_id(current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    success = await profile_repo.delete_education(edu_id, profile.id)
    if not success:
        raise HTTPException(status_code=404, detail="Education not found.")


@router.post("/skills", response_model=List[SkillSchema])
async def sync_skills(
    skills_req: List[SkillSchema],
    current_user: Annotated[User, Depends(get_current_user)],
    profile_repo: Annotated[SqlAlchemyProfileRepository, Depends(get_profile_repository)],
):
    use_case = SyncSkillsUseCase(profile_repo)
    synced = await use_case.execute(current_user.id, [s.model_dump() for s in skills_req])
    return synced


@router.get("/saved-answers", response_model=List[SavedAnswerSchema])
async def list_saved_answers(
    current_user: Annotated[User, Depends(get_current_user)],
    answer_repo: Annotated[SqlAlchemySavedAnswerRepository, Depends(get_saved_answer_repository)],
):
    use_case = ManageSavedAnswersUseCase(answer_repo)
    return await use_case.list_answers(current_user.id)


@router.post("/saved-answers", response_model=SavedAnswerSchema)
async def save_saved_answer(
    req: SavedAnswerSchema,
    current_user: Annotated[User, Depends(get_current_user)],
    answer_repo: Annotated[SqlAlchemySavedAnswerRepository, Depends(get_saved_answer_repository)],
):
    use_case = ManageSavedAnswersUseCase(answer_repo)
    saved = await use_case.save_answer(
        user_id=current_user.id,
        canonical_intent=req.canonical_intent,
        question_pattern=req.question_pattern,
        answer_text=req.answer_text,
    )
    return saved
