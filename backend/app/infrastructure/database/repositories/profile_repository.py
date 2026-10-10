from typing import List
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
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
from app.infrastructure.database.models.models import (
    ApplicationModel,
    CampaignModel,
    CandidateProfileModel,
    CandidateSkillModel,
    EducationModel,
    ExperienceModel,
    ResumeModel,
    SavedAnswerModel,
)


class SqlAlchemyProfileRepository(CandidateProfileRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: CandidateProfileModel) -> CandidateProfile:
        experiences = [
            Experience(
                id=e.id,
                profile_id=e.profile_id,
                company_name=e.company_name,
                title=e.title,
                location=e.location,
                start_date=e.start_date,
                end_date=e.end_date,
                is_current=e.is_current,
                description=e.description,
            )
            for e in (model.experiences or [])
        ]
        educations = [
            Education(
                id=ed.id,
                profile_id=ed.profile_id,
                institution=ed.institution,
                degree=ed.degree,
                field_of_study=ed.field_of_study,
                start_year=ed.start_year,
                end_year=ed.end_year,
                grade=ed.grade,
            )
            for ed in (model.educations or [])
        ]
        skills = [
            CandidateSkill(
                id=s.id,
                profile_id=s.profile_id,
                skill_name=s.skill_name,
                years_experience=s.years_experience,
                is_primary=s.is_primary,
            )
            for s in (model.skills or [])
        ]
        return CandidateProfile(
            id=model.id,
            user_id=model.user_id,
            headline=model.headline,
            summary=model.summary,
            phone=model.phone,
            location=model.location,
            current_ctc=model.current_ctc,
            expected_ctc=model.expected_ctc,
            currency=model.currency,
            notice_period_days=model.notice_period_days,
            total_experience_months=model.total_experience_months,
            work_authorization=model.work_authorization,
            relocation_preference=model.relocation_preference,
            remote_preference=model.remote_preference,
            created_at=model.created_at,
            updated_at=model.updated_at,
            experiences=experiences,
            educations=educations,
            skills=skills,
        )

    async def get_by_user_id(self, user_id: str) -> CandidateProfile | None:
        stmt = (
            select(CandidateProfileModel)
            .where(CandidateProfileModel.user_id == user_id)
            .options(
                selectinload(CandidateProfileModel.experiences),
                selectinload(CandidateProfileModel.educations),
                selectinload(CandidateProfileModel.skills),
            )
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def save_profile(self, profile: CandidateProfile) -> CandidateProfile:
        stmt = select(CandidateProfileModel).where(CandidateProfileModel.user_id == profile.user_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            model = CandidateProfileModel(
                id=profile.id,
                user_id=profile.user_id,
                headline=profile.headline,
                summary=profile.summary,
                phone=profile.phone,
                location=profile.location,
                current_ctc=profile.current_ctc,
                expected_ctc=profile.expected_ctc,
                currency=profile.currency,
                notice_period_days=profile.notice_period_days,
                total_experience_months=profile.total_experience_months,
                work_authorization=profile.work_authorization,
                relocation_preference=profile.relocation_preference,
                remote_preference=profile.remote_preference,
            )
            self._session.add(model)
        else:
            model.headline = profile.headline
            model.summary = profile.summary
            model.phone = profile.phone
            model.location = profile.location
            model.current_ctc = profile.current_ctc
            model.expected_ctc = profile.expected_ctc
            model.currency = profile.currency
            model.notice_period_days = profile.notice_period_days
            model.total_experience_months = profile.total_experience_months
            model.work_authorization = profile.work_authorization
            model.relocation_preference = profile.relocation_preference
            model.remote_preference = profile.remote_preference

        await self._session.flush()
        return await self.get_by_user_id(profile.user_id)  # type: ignore

    async def add_experience(self, exp: Experience) -> Experience:
        model = ExperienceModel(
            id=exp.id,
            profile_id=exp.profile_id,
            company_name=exp.company_name,
            title=exp.title,
            location=exp.location,
            start_date=exp.start_date,
            end_date=exp.end_date,
            is_current=exp.is_current,
            description=exp.description,
        )
        self._session.add(model)
        await self._session.flush()
        return exp

    async def delete_experience(self, exp_id: str, profile_id: str) -> bool:
        stmt = delete(ExperienceModel).where(
            ExperienceModel.id == exp_id, ExperienceModel.profile_id == profile_id
        )
        result = await self._session.execute(stmt)
        await self._session.flush()
        return result.rowcount > 0

    async def add_education(self, edu: Education) -> Education:
        model = EducationModel(
            id=edu.id,
            profile_id=edu.profile_id,
            institution=edu.institution,
            degree=edu.degree,
            field_of_study=edu.field_of_study,
            start_year=edu.start_year,
            end_year=edu.end_year,
            grade=edu.grade,
        )
        self._session.add(model)
        await self._session.flush()
        return edu

    async def delete_education(self, edu_id: str, profile_id: str) -> bool:
        stmt = delete(EducationModel).where(
            EducationModel.id == edu_id, EducationModel.profile_id == profile_id
        )
        result = await self._session.execute(stmt)
        await self._session.flush()
        return result.rowcount > 0

    async def sync_skills(self, profile_id: str, skills: List[CandidateSkill]) -> List[CandidateSkill]:
        await self._session.execute(
            delete(CandidateSkillModel).where(CandidateSkillModel.profile_id == profile_id)
        )
        for s in skills:
            model = CandidateSkillModel(
                id=s.id,
                profile_id=profile_id,
                skill_name=s.skill_name.strip(),
                years_experience=s.years_experience,
                is_primary=s.is_primary,
            )
            self._session.add(model)
        await self._session.flush()
        return skills


class SqlAlchemyResumeRepository(ResumeRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: ResumeModel) -> Resume:
        return Resume(
            id=model.id,
            user_id=model.user_id,
            label=model.label,
            target_role=model.target_role,
            file_path=model.file_path,
            file_name=model.file_name,
            mime_type=model.mime_type,
            raw_text=model.raw_text,
            is_default=model.is_default,
            created_at=model.created_at,
        )

    async def get_by_id(self, resume_id: str) -> Resume | None:
        stmt = select(ResumeModel).where(ResumeModel.id == resume_id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def list_by_user_id(self, user_id: str) -> List[Resume]:
        stmt = select(ResumeModel).where(ResumeModel.user_id == user_id).order_by(ResumeModel.created_at.desc())
        result = await self._session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def save(self, resume: Resume) -> Resume:
        if resume.is_default:
            await self._session.execute(
                update(ResumeModel)
                .where(ResumeModel.user_id == resume.user_id, ResumeModel.id != resume.id)
                .values(is_default=False)
            )

        stmt = select(ResumeModel).where(ResumeModel.id == resume.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            model = ResumeModel(
                id=resume.id,
                user_id=resume.user_id,
                label=resume.label,
                target_role=resume.target_role,
                file_path=resume.file_path,
                file_name=resume.file_name,
                mime_type=resume.mime_type,
                raw_text=resume.raw_text,
                is_default=resume.is_default,
            )
            self._session.add(model)
        else:
            model.label = resume.label
            model.target_role = resume.target_role
            model.file_path = resume.file_path
            model.raw_text = resume.raw_text
            model.is_default = resume.is_default

        await self._session.flush()
        await self._session.refresh(model)
        return self._to_entity(model)

    async def can_delete(self, resume_id: str, user_id: str) -> tuple[bool, str | None]:
        """
        Validates if resume can be safely deleted.
        Returns (False, reason) if active applications or running campaigns depend on it.
        """
        active_states = [
            "APPROVED",
            "QUEUED",
            "APPLYING",
            "FORM_DETECTED",
            "FORM_FILLED",
            "SUBMITTING",
            "PAUSED_OTP",
            "PAUSED_CAPTCHA",
            "PAUSED_USER_INPUT",
            "RECONCILIATION_REQUIRED",
        ]
        app_stmt = (
            select(ApplicationModel.id)
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.resume_id == resume_id,
                ApplicationModel.workflow_state.in_(active_states),
            )
            .limit(1)
        )
        app_res = await self._session.execute(app_stmt)
        if app_res.scalar_one_or_none():
            return (
                False,
                "Cannot delete resume: actively in use by pending or active applications (RESUME_IN_USE).",
            )

        camp_stmt = (
            select(CampaignModel.id)
            .where(
                CampaignModel.user_id == user_id,
                CampaignModel.target_resume_id == resume_id,
                CampaignModel.state == "RUNNING",
            )
            .limit(1)
        )
        camp_res = await self._session.execute(camp_stmt)
        if camp_res.scalar_one_or_none():
            return (
                False,
                "Cannot delete resume: actively assigned to a running campaign (RESUME_IN_USE).",
            )

        return (True, None)

    async def delete(self, resume_id: str, user_id: str) -> bool:
        can_del, _ = await self.can_delete(resume_id, user_id)
        if not can_del:
            return False

        target = await self.get_by_id(resume_id)
        was_default = target.is_default if target else False

        stmt = delete(ResumeModel).where(ResumeModel.id == resume_id, ResumeModel.user_id == user_id)
        result = await self._session.execute(stmt)
        await self._session.flush()

        # If deleted resume was default, assign default to the latest remaining resume
        if was_default:
            remaining = await self.list_by_user_id(user_id)
            if remaining:
                await self.set_default(remaining[0].id, user_id)

        return result.rowcount > 0

    async def set_default(self, resume_id: str, user_id: str) -> Resume | None:
        target = await self.get_by_id(resume_id)
        if not target or target.user_id != user_id:
            return None

        # Reset all resumes for this user
        await self._session.execute(
            update(ResumeModel)
            .where(ResumeModel.user_id == user_id)
            .values(is_default=False)
        )

        # Set target as default
        await self._session.execute(
            update(ResumeModel)
            .where(ResumeModel.id == resume_id, ResumeModel.user_id == user_id)
            .values(is_default=True)
        )
        await self._session.flush()
        return await self.get_by_id(resume_id)


class SqlAlchemySavedAnswerRepository(SavedAnswerRepository):
    def __init__(self, session: AsyncSession):
        self._session = session

    def _to_entity(self, model: SavedAnswerModel) -> SavedAnswer:
        return SavedAnswer(
            id=model.id,
            user_id=model.user_id,
            canonical_intent=model.canonical_intent,
            question_pattern=model.question_pattern,
            answer_text=model.answer_text,
            is_verified=model.is_verified,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    async def list_by_user_id(self, user_id: str) -> List[SavedAnswer]:
        stmt = select(SavedAnswerModel).where(SavedAnswerModel.user_id == user_id)
        result = await self._session.execute(stmt)
        models = result.scalars().all()
        return [self._to_entity(m) for m in models]

    async def find_by_intent(self, user_id: str, canonical_intent: str) -> SavedAnswer | None:
        stmt = select(SavedAnswerModel).where(
            SavedAnswerModel.user_id == user_id,
            SavedAnswerModel.canonical_intent == canonical_intent,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return self._to_entity(model) if model else None

    async def save(self, answer: SavedAnswer) -> SavedAnswer:
        stmt = select(SavedAnswerModel).where(SavedAnswerModel.id == answer.id)
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()

        if not model:
            model = SavedAnswerModel(
                id=answer.id,
                user_id=answer.user_id,
                canonical_intent=answer.canonical_intent,
                question_pattern=answer.question_pattern,
                answer_text=answer.answer_text,
                is_verified=answer.is_verified,
            )
            self._session.add(model)
        else:
            model.canonical_intent = answer.canonical_intent
            model.question_pattern = answer.question_pattern
            model.answer_text = answer.answer_text
            model.is_verified = answer.is_verified

        await self._session.flush()
        await self._session.refresh(model)
        return self._to_entity(model)
