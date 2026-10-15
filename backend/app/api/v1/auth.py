from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, get_user_repository, oauth2_scheme
from app.core.config import settings
from app.core.database import get_db_session
from app.core.rate_limit import rate_limit
from app.infrastructure.database.repositories.revoked_token_repository import SqlAlchemyRevokedTokenRepository
from app.application.auth.use_cases import LoginUserUseCase, RegisterUserUseCase
from app.core.exceptions import AuthenticationException, DuplicateEntityException
from app.domain.auth.entities import User
from app.domain.auth.repositories import UserRepository

router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

    @field_validator("password")
    @classmethod
    def password_long_enough(cls, value: str) -> str:
        if len(value) < settings.PASSWORD_MIN_LENGTH:
            raise ValueError(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long.")
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class DeleteAccountRequest(BaseModel):
    password: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    is_active: bool
    is_superuser: bool


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("register"))],
)
async def register(
    req: RegisterRequest,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
):
    use_case = RegisterUserUseCase(user_repo)
    try:
        user, token = await use_case.execute(
            email=req.email,
            password=req.password,
            full_name=req.full_name,
        )
        from app.core.security import create_refresh_token
        refresh_token = create_refresh_token({"sub": user.id})
        return AuthResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            access_token=token,
            refresh_token=refresh_token,
        )
    except DuplicateEntityException as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(rate_limit("login"))])
async def login(
    req: LoginRequest,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
):
    use_case = LoginUserUseCase(user_repo)
    try:
        user, token = await use_case.execute(email=req.email, password=req.password)
        from app.core.security import create_refresh_token
        refresh_token = create_refresh_token({"sub": user.id})
        return AuthResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            access_token=token,
            refresh_token=refresh_token,
        )
    except AuthenticationException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


@router.post("/refresh", response_model=AuthResponse, dependencies=[Depends(rate_limit("refresh"))])
async def refresh_token_endpoint(
    req: RefreshTokenRequest,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    from app.core.security import create_access_token, create_refresh_token, decode_refresh_token
    try:
        payload = decode_refresh_token(req.refresh_token)
        user_id = payload.get("sub")
        if not user_id:
            raise AuthenticationException("Invalid token payload.")
        revoked = SqlAlchemyRevokedTokenRepository(session)
        if await revoked.is_revoked(payload.get("jti")):
            raise AuthenticationException("Refresh token has been revoked.")
        # Rotation: each refresh token works once.
        await revoked.revoke(
            payload.get("jti"),
            datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
            user_id=user_id,
        )
        user = await user_repo.get_by_id(user_id)
        if not user or not user.is_active:
            raise AuthenticationException("User account not found or inactive.")
        new_access = create_access_token({"sub": user.id, "email": user.email})
        new_refresh = create_refresh_token({"sub": user.id})
        return AuthResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            access_token=new_access,
            refresh_token=new_refresh,
        )
    except AuthenticationException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


@router.post("/logout")
async def logout(
    current_user: Annotated[User, Depends(get_current_user)],
    access_token: Annotated[str | None, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    body: LogoutRequest | None = None,
):
    """Revoke the access token used for this call and, if sent, the refresh token."""
    from app.core.security import decode_access_token, decode_refresh_token

    revoked = SqlAlchemyRevokedTokenRepository(session)
    access = decode_access_token(access_token)
    await revoked.revoke(
        access.get("jti"), datetime.fromtimestamp(access["exp"], tz=timezone.utc), user_id=current_user.id
    )
    if body and body.refresh_token:
        try:
            refresh = decode_refresh_token(body.refresh_token)
        except AuthenticationException:
            refresh = None  # already invalid: nothing to revoke
        if refresh and refresh.get("sub") == current_user.id:
            await revoked.revoke(
                refresh.get("jti"), datetime.fromtimestamp(refresh["exp"], tz=timezone.utc), user_id=current_user.id
            )
    await revoked.purge_expired()
    return {"message": "Successfully logged out."}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_superuser=current_user.is_superuser,
    )


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_account(
    req: DeleteAccountRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    """Permanently delete the account and all of its data (PRV-01). Needs the password."""
    from app.core.security import verify_password
    from app.infrastructure.database.repositories.user_data_eraser import erase_user

    if not verify_password(req.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password is incorrect.")
    await erase_user(session, current_user.id)
