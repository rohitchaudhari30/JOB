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

        list_keys = ("experiences", "educations", "skills")
        for key, value in data.items():
            if hasattr(profile, key) and key not in ("id", "user_id", *list_keys):
                setattr(profile, key, value)

        saved = await self._profile_repo.save_profile(profile)

        # Replace each list only when the caller actually sent it.
        if data.get("skills") is not None:
            await self._replace_skills(saved, data["skills"])
        if data.get("experiences") is not None:
            await self._replace_experiences(saved, data["experiences"])
        if data.get("educations") is not None:
            await self._replace_educations(saved, data["educations"])

        return await self._profile_repo.get_by_user_id(user_id)

    async def _replace_skills(self, profile: CandidateProfile, items: List[Dict[str, Any]]) -> None:
        skills = [
            CandidateSkill(
                id=str(uuid.uuid4()),
                profile_id=profile.id,
                skill_name=item["skill_name"],
                years_experience=float(item.get("years_experience") or 0.0),
                is_primary=bool(item.get("is_primary", False)),
            )
            for item in items
        ]
        await self._profile_repo.sync_skills(profile.id, skills)

    async def _replace_experiences(self, profile: CandidateProfile, items: List[Dict[str, Any]]) -> None:
        for old in list(profile.experiences):
            await self._profile_repo.delete_experience(old.id, profile.id)
        for item in items:
            await self._profile_repo.add_experience(
                Experience(
                    id=str(uuid.uuid4()),
                    profile_id=profile.id,
                    company_name=item["company_name"],
                    title=item["title"],
                    location=item.get("location"),
                    start_date=item.get("start_date"),
                    end_date=item.get("end_date"),
                    is_current=item.get("is_current", False),
                    description=item.get("description"),
                )
            )

    async def _replace_educations(self, profile: CandidateProfile, items: List[Dict[str, Any]]) -> None:
        for old in list(profile.educations):
            await self._profile_repo.delete_education(old.id, profile.id)
        for item in items:
            await self._profile_repo.add_education(
                Education(
                    id=str(uuid.uuid4()),
                    profile_id=profile.id,
                    institution=item["institution"],
                    degree=item["degree"],
                    field_of_study=item.get("field_of_study"),
                    start_year=item.get("start_year"),
                    end_year=item.get("end_year"),
                    grade=item.get("grade"),
                )
            )


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
