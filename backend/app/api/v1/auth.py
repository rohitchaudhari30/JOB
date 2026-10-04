from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from app.api.deps import get_current_user, get_user_repository
from app.application.auth.use_cases import LoginUserUseCase, RegisterUserUseCase
from app.core.exceptions import AuthenticationException, DuplicateEntityException
from app.domain.auth.entities import User
from app.domain.auth.repositories import UserRepository

router = APIRouter(prefix="/auth", tags=["Authentication"])


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None = None
    is_active: bool
    is_superuser: bool


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
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
        return AuthResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            access_token=token,
        )
    except DuplicateEntityException as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=e.message)


@router.post("/login", response_model=AuthResponse)
async def login(
    req: LoginRequest,
    user_repo: Annotated[UserRepository, Depends(get_user_repository)],
):
    use_case = LoginUserUseCase(user_repo)
    try:
        user, token = await use_case.execute(email=req.email, password=req.password)
        return AuthResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            access_token=token,
        )
    except AuthenticationException as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=e.message)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: Annotated[User, Depends(get_current_user)]):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_superuser=current_user.is_superuser,
    )
