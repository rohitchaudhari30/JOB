import os
import shutil
import uuid
from datetime import datetime
from typing import Annotated, List
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.api.deps import get_ai_gateway, get_current_user, get_resume_repository
from app.application.profile.use_cases import UploadResumeUseCase
from app.core.config import settings
from app.domain.ai.contracts import AIGateway
from app.domain.auth.entities import User
from app.infrastructure.database.repositories.profile_repository import SqlAlchemyResumeRepository

router = APIRouter(prefix="/resumes", tags=["Resumes"])


class ResumeResponse(BaseModel):
    id: str
    user_id: str
    label: str
    target_role: str
    file_name: str
    mime_type: str
    is_default: bool
    created_at: datetime | None = None


@router.get("", response_model=List[ResumeResponse])
async def list_resumes(
    current_user: Annotated[User, Depends(get_current_user)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
):
    resumes = await resume_repo.list_by_user_id(current_user.id)
    return resumes


@router.post("", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
@router.post("/upload", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    label: str = Form("Default Resume"),
    target_role: str = Form("Software Engineer"),
    is_default: bool = Form(False),
    current_user: Annotated[User, Depends(get_current_user)] = None,
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)] = None,
    ai_gateway: Annotated[AIGateway, Depends(get_ai_gateway)] = None,
):
    upload_dir = os.path.join(settings.STORAGE_DIR, "resumes", current_user.id)
    os.makedirs(upload_dir, exist_ok=True)

    file_ext = os.path.splitext(file.filename or "resume.pdf")[1]
    saved_filename = f"{uuid.uuid4()}{file_ext}"
    saved_path = os.path.join(upload_dir, saved_filename)

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Basic raw text placeholder / extraction
    raw_text = f"Extracted resume content for {label} - {target_role}"

    use_case = UploadResumeUseCase(resume_repo)
    resume = await use_case.execute(
        user_id=current_user.id,
        label=label,
        target_role=target_role,
        file_path=saved_path,
        file_name=file.filename or saved_filename,
        mime_type=file.content_type or "application/pdf",
        raw_text=raw_text,
        is_default=is_default,
    )
    return resume


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
):
    resume = await resume_repo.get_by_id(resume_id)
    if not resume or resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found.")

    if os.path.exists(resume.file_path):
        try:
            os.remove(resume.file_path)
        except Exception:
            pass

    await resume_repo.delete(resume_id, current_user.id)


@router.post("/{resume_id}/set-default", response_model=ResumeResponse)
@router.patch("/{resume_id}/default", response_model=ResumeResponse)
async def set_default_resume(
    resume_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
):
    resume = await resume_repo.set_default(resume_id, current_user.id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return resume


@router.get("/{resume_id}/download")
async def download_resume(
    resume_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    resume_repo: Annotated[SqlAlchemyResumeRepository, Depends(get_resume_repository)],
):
    resume = await resume_repo.get_by_id(resume_id)
    if not resume or resume.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Resume not found.")

    if not os.path.exists(resume.file_path):
        raise HTTPException(status_code=404, detail="Resume file not found on disk.")

    return FileResponse(
        path=resume.file_path,
        filename=resume.file_name,
        media_type=resume.mime_type or "application/pdf",
    )
