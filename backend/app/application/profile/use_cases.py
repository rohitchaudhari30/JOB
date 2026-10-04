import uuid
from typing import Any, Dict, List
from app.core.exceptions import EntityNotFoundException
from app.domain.profile.entities import (
    CandidateProfile,
    CandidateSkill,
    Education,
    Experience,
    Resume,
    SavedAnswer,
)
from app.domain.profile.repositories import (
    CandidateProfileRepository,
    ResumeRepository,
    SavedAnswerRepository,
)


class GetProfileUseCase:
    def __init__(self, profile_repo: CandidateProfileRepository):
        self._profile_repo = profile_repo

    async def execute(self, user_id: str) -> CandidateProfile:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            # Create a blank default profile if not present
            new_profile = CandidateProfile(
                id=str(uuid.uuid4()),
                user_id=user_id,
            )
            profile = await self._profile_repo.save_profile(new_profile)
        return profile


class UpdateProfileUseCase:
    def __init__(self, profile_repo: CandidateProfileRepository):
        self._profile_repo = profile_repo

    async def execute(self, user_id: str, data: Dict[str, Any]) -> CandidateProfile:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            profile = CandidateProfile(
                id=str(uuid.uuid4()),
                user_id=user_id,
            )

        for key, value in data.items():
            if hasattr(profile, key) and key not in ("id", "user_id", "experiences", "educations", "skills"):
                setattr(profile, key, value)

        return await self._profile_repo.save_profile(profile)


class AddExperienceUseCase:
    def __init__(self, profile_repo: CandidateProfileRepository):
        self._profile_repo = profile_repo

    async def execute(self, user_id: str, exp_data: Dict[str, Any]) -> Experience:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            profile = await self._profile_repo.save_profile(CandidateProfile(id=str(uuid.uuid4()), user_id=user_id))

        exp = Experience(
            id=str(uuid.uuid4()),
            profile_id=profile.id,
            company_name=exp_data["company_name"],
            title=exp_data["title"],
            location=exp_data.get("location"),
            start_date=exp_data.get("start_date"),
            end_date=exp_data.get("end_date"),
            is_current=exp_data.get("is_current", False),
            description=exp_data.get("description"),
        )
        return await self._profile_repo.add_experience(exp)


class AddEducationUseCase:
    def __init__(self, profile_repo: CandidateProfileRepository):
        self._profile_repo = profile_repo

    async def execute(self, user_id: str, edu_data: Dict[str, Any]) -> Education:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            profile = await self._profile_repo.save_profile(CandidateProfile(id=str(uuid.uuid4()), user_id=user_id))

        edu = Education(
            id=str(uuid.uuid4()),
            profile_id=profile.id,
            institution=edu_data["institution"],
            degree=edu_data["degree"],
            field_of_study=edu_data.get("field_of_study"),
            start_year=edu_data.get("start_year"),
            end_year=edu_data.get("end_year"),
            grade=edu_data.get("grade"),
        )
        return await self._profile_repo.add_education(edu)


class SyncSkillsUseCase:
    def __init__(self, profile_repo: CandidateProfileRepository):
        self._profile_repo = profile_repo

    async def execute(self, user_id: str, skills_data: List[Dict[str, Any]]) -> List[CandidateSkill]:
        profile = await self._profile_repo.get_by_user_id(user_id)
        if not profile:
            profile = await self._profile_repo.save_profile(CandidateProfile(id=str(uuid.uuid4()), user_id=user_id))

        skills = [
            CandidateSkill(
                id=str(uuid.uuid4()),
                profile_id=profile.id,
                skill_name=s["skill_name"],
                years_experience=float(s.get("years_experience", 0.0)),
                is_primary=s.get("is_primary", False),
            )
            for s in skills_data
        ]
        return await self._profile_repo.sync_skills(profile.id, skills)


class UploadResumeUseCase:
    def __init__(self, resume_repo: ResumeRepository):
        self._resume_repo = resume_repo

    async def execute(
        self,
        user_id: str,
        label: str,
        target_role: str,
        file_path: str,
        file_name: str,
        mime_type: str = "application/pdf",
        raw_text: str | None = None,
        is_default: bool = False,
    ) -> Resume:
        resume = Resume(
            id=str(uuid.uuid4()),
            user_id=user_id,
            label=label,
            target_role=target_role,
            file_path=file_path,
            file_name=file_name,
            mime_type=mime_type,
            raw_text=raw_text,
            is_default=is_default,
        )
        return await self._resume_repo.save(resume)


class ManageSavedAnswersUseCase:
    def __init__(self, answer_repo: SavedAnswerRepository):
        self._answer_repo = answer_repo

    async def list_answers(self, user_id: str) -> List[SavedAnswer]:
        return await self._answer_repo.list_by_user_id(user_id)

    async def save_answer(
        self, user_id: str, canonical_intent: str, question_pattern: str, answer_text: str
    ) -> SavedAnswer:
        existing = await self._answer_repo.find_by_intent(user_id, canonical_intent)
        answer_id = existing.id if existing else str(uuid.uuid4())
        answer = SavedAnswer(
            id=answer_id,
            user_id=user_id,
            canonical_intent=canonical_intent,
            question_pattern=question_pattern,
            answer_text=answer_text,
            is_verified=True,
        )
        return await self._answer_repo.save(answer)
