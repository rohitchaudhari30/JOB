import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from app.core.exceptions import AuthenticationException, DuplicateEntityException
from app.core.security import create_access_token, get_password_hash, verify_password
from app.domain.auth.entities import User, UserSession
from app.domain.auth.repositories import UserRepository


class RegisterUserUseCase:
    def __init__(self, user_repo: UserRepository):
        self._user_repo = user_repo

    async def execute(self, email: str, password: str, full_name: str | None = None) -> tuple[User, str]:
        existing = await self._user_repo.get_by_email(email)
        if existing:
            raise DuplicateEntityException("User", "email", email)

        hashed_pwd = get_password_hash(password)
        new_user = User(
            id=str(uuid.uuid4()),
            email=email.lower().strip(),
            hashed_password=hashed_pwd,
            full_name=full_name,
        )
        created_user = await self._user_repo.create(new_user)

        token = create_access_token({"sub": created_user.id, "email": created_user.email})
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

        session = UserSession(
            id=str(uuid.uuid4()),
            user_id=created_user.id,
            jwt_token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        await self._user_repo.create_session(session)

        return created_user, token


class LoginUserUseCase:
    def __init__(self, user_repo: UserRepository):
        self._user_repo = user_repo

    async def execute(self, email: str, password: str) -> tuple[User, str]:
        user = await self._user_repo.get_by_email(email)
        if not user or not verify_password(password, user.hashed_password):
            raise AuthenticationException("Invalid email or password.")

        if not user.is_active:
            raise AuthenticationException("User account is disabled.")

        token = create_access_token({"sub": user.id, "email": user.email})
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

        session = UserSession(
            id=str(uuid.uuid4()),
            user_id=user.id,
            jwt_token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        await self._user_repo.create_session(session)

        return user, token
