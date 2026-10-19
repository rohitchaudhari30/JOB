from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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


REFRESH_COOKIE = "refresh_token"
_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, token: str) -> None:
    """The refresh token lives only in an HttpOnly cookie, so page scripts (XSS) cannot read it (SEC-08)."""
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        httponly=True,
        secure=not settings.is_dev_environment,  # HTTPS only outside dev/test
        samesite="strict",
        path=_COOKIE_PATH,  # sent to the auth endpoints only
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=_COOKIE_PATH)


def _require_same_origin(request: Request) -> None:
    """CSRF defence for cookie-authenticated calls (on top of SameSite=Strict): a browser-sent Origin
    header, when present, must be one of ours. Non-browser clients send none."""
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origin_list and origin.rstrip("/") != str(request.base_url).rstrip("/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-site request refused.")


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
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str | None = None  # API clients only; browsers use the cookie


class DeleteAccountRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_long_enough(cls, value: str) -> str:
        if len(value) < settings.PASSWORD_MIN_LENGTH:
            raise ValueError(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long.")
        return value


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
    response: Response,
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
        _set_refresh_cookie(response, create_refresh_token({"sub": user.id}))
        return AuthResponse(id=user.id, email=user.email, full_name=user.full_name, access_token=token)
    except DuplicateEntityException as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(rate_limit("login"))])
async def login(
    req: LoginRequest,
    response: Response,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
):
    use_case = LoginUserUseCase(user_repo)
    try:
        user, token = await use_case.execute(email=req.email, password=req.password)
        from app.core.security import create_refresh_token
        _set_refresh_cookie(response, create_refresh_token({"sub": user.id}))
        return AuthResponse(id=user.id, email=user.email, full_name=user.full_name, access_token=token)
    except AuthenticationException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


@router.post("/refresh", response_model=AuthResponse, dependencies=[Depends(rate_limit("refresh"))])
async def refresh_token_endpoint(
    request: Request,
    response: Response,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    req: RefreshTokenRequest | None = None,
):
    from app.core.security import create_access_token, create_refresh_token, decode_refresh_token, issued_before_cutoff
    cookie_token = request.cookies.get(REFRESH_COOKIE)
    if cookie_token:
        _require_same_origin(request)
    supplied = cookie_token or (req.refresh_token if req else None)
    try:
        if not supplied:
            raise AuthenticationException("No refresh token.")
        payload = decode_refresh_token(supplied)
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
        if issued_before_cutoff(payload, user.tokens_valid_after):
            raise AuthenticationException("Session ended: the password was changed.")
        new_access = create_access_token({"sub": user.id, "email": user.email})
        _set_refresh_cookie(response, create_refresh_token({"sub": user.id}))
        return AuthResponse(id=user.id, email=user.email, full_name=user.full_name, access_token=new_access)
    except AuthenticationException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
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
    supplied = request.cookies.get(REFRESH_COOKIE) or (body.refresh_token if body else None)
    _clear_refresh_cookie(response)
    if supplied:
        try:
            refresh = decode_refresh_token(supplied)
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


@router.post("/change-password", response_model=AuthResponse, dependencies=[Depends(rate_limit("change_password"))])
async def change_password(
    req: ChangePasswordRequest,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
):
    """Change the password and sign out every other session (all tokens issued before now stop working).

    The caller stays signed in: the response carries a fresh access token and sets a fresh refresh cookie.
    """
    from app.core.security import create_access_token, create_refresh_token, get_password_hash, verify_password

    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect.")
    if verify_password(req.new_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a password different from the current one.")
    await user_repo.set_password(current_user.id, get_password_hash(req.new_password), datetime.now(timezone.utc))
    _set_refresh_cookie(response, create_refresh_token({"sub": current_user.id}))
    return AuthResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        access_token=create_access_token({"sub": current_user.id, "email": current_user.email}),
    )


@router.get("/me/export", dependencies=[Depends(rate_limit("export"))])
async def export_my_data(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
):
    """Download everything stored about the signed-in user as one JSON file. No credentials or file paths."""
    import json

    from app.infrastructure.database.repositories.user_data_export import export_user_data

    payload = await export_user_data(session, current_user)
    return Response(
        content=json.dumps(payload, indent=2, default=str),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store"},
    )
