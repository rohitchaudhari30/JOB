from abc import ABC, abstractmethod
from app.domain.auth.entities import User, UserSession


class UserRepository(ABC):
    @abstractmethod
    async def get_by_id(self, user_id: str) -> User | None:
        pass

    @abstractmethod
    async def get_by_email(self, email: str) -> User | None:
        pass

    @abstractmethod
    async def create(self, user: User) -> User:
        pass

    @abstractmethod
    async def create_session(self, session: UserSession) -> UserSession:
        pass

    @abstractmethod
    async def get_session_by_hash(self, token_hash: str) -> UserSession | None:
        pass
