from abc import ABC, abstractmethod
from typing import List
from app.domain.profile.entities import (
    CandidateProfile,
    CandidateSkill,
    Education,
    Experience,
    Resume,
    SavedAnswer,
)


class CandidateProfileRepository(ABC):
    @abstractmethod
    async def get_by_user_id(self, user_id: str) -> CandidateProfile | None:
        pass

    @abstractmethod
    async def save_profile(self, profile: CandidateProfile) -> CandidateProfile:
        pass

    @abstractmethod
    async def add_experience(self, exp: Experience) -> Experience:
        pass

    @abstractmethod
    async def delete_experience(self, exp_id: str, profile_id: str) -> bool:
        pass

    @abstractmethod
    async def add_education(self, edu: Education) -> Education:
        pass

    @abstractmethod
    async def delete_education(self, edu_id: str, profile_id: str) -> bool:
        pass

    @abstractmethod
    async def sync_skills(self, profile_id: str, skills: List[CandidateSkill]) -> List[CandidateSkill]:
        pass


class ResumeRepository(ABC):
    @abstractmethod
    async def get_by_id(self, resume_id: str) -> Resume | None:
        pass

    @abstractmethod
    async def list_by_user_id(self, user_id: str) -> List[Resume]:
        pass

    @abstractmethod
    async def save(self, resume: Resume) -> Resume:
        pass

    @abstractmethod
    async def delete(self, resume_id: str, user_id: str) -> bool:
        pass

    @abstractmethod
    async def set_default(self, resume_id: str, user_id: str) -> Resume | None:
        pass


class SavedAnswerRepository(ABC):
    @abstractmethod
    async def list_by_user_id(self, user_id: str) -> List[SavedAnswer]:
        pass

    @abstractmethod
    async def find_by_intent(self, user_id: str, canonical_intent: str) -> SavedAnswer | None:
        pass

    @abstractmethod
    async def save(self, answer: SavedAnswer) -> SavedAnswer:
        pass
