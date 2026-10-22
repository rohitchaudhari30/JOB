from typing import Annotated, Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.application.resume_tailoring.service import TailoringService
from app.core.database import get_db_session
from app.domain.auth.entities import User
from app.domain.resume_tailoring.entities import TailoredResume
from app.infrastructure.tailoring_factory import build_tailoring_service

router = APIRouter(tags=["Resume tailoring"])


async def get_tailoring_service(session: Annotated[AsyncSession, Depends(get_db_session)]) -> TailoringService:
    from app.workers.tailoring_worker import tailoring_worker

    return build_tailoring_service(session, on_work_queued=tailoring_worker.notify)


class StartTailoringRequest(BaseModel):
    master_resume_id: Optional[str] = None


class AnswerItem(BaseModel):
    question_id: str
    has_it: bool
    details: Optional[str] = Field(default=None, max_length=1000)


class AnswersRequest(BaseModel):
    answers: List[AnswerItem] = Field(min_length=1, max_length=20)


class GenerateRequest(BaseModel):
    approved_edit_ids: List[str] = Field(min_length=1, max_length=40)


def _view(item: TailoredResume) -> Dict[str, Any]:
    return {
        "id": item.id,
        "status": item.status.value,
        "mode": item.mode,
        "job_id": item.job_id,
        "job_title": item.job_title_snapshot,
        "company": item.company_snapshot,
        "master_resume_id": item.master_resume_id,
        "master_label": item.master_label_snapshot,
        "version": item.version,
        "analysis": item.analysis,
        "edit_plan": item.edit_plan,
        "approved_edit_ids": item.approved_edit_ids or [],
        "validation": item.validation,
        "file_name": item.file_name,
        "has_file": bool(item.file_path),
        "has_pdf": bool(item.pdf_file_path),
        "error_code": item.error_code,
        "error_message": item.error_message,
        "created_at": item.created_at,
        "approved_at": item.approved_at,
        "expires_at": item.expires_at,
    }


@router.post("/jobs/{job_id}/tailor", status_code=status.HTTP_202_ACCEPTED)
async def start_tailoring(
    job_id: str,
    req: StartTailoringRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return _view(await service.start(current_user.id, job_id, req.master_resume_id))


@router.get("/jobs/{job_id}/tailored-resumes")
async def list_tailored_for_job(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return [_view(i) for i in await service.list_for_job(current_user.id, job_id)]


@router.get("/tailored-resumes")
async def list_saved_tailored(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    """The user's saved tailored resumes (one summary row each), newest first."""
    return [
        {
            "id": i.id,
            "job_id": i.job_id,
            "job_title": i.job_title_snapshot,
            "company": i.company_snapshot,
            "master_label": i.master_label_snapshot,
            "file_name": i.file_name,
            "has_pdf": bool(i.pdf_file_path),
            "approved_at": i.approved_at,
        }
        for i in await service.list_saved(current_user.id)
    ]


@router.get("/tailored-resumes/{tailored_id}")
async def get_tailored(
    tailored_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return _view(await service.get(current_user.id, tailored_id))


@router.post("/tailored-resumes/{tailored_id}/answers")
async def answer_questions(
    tailored_id: str,
    req: AnswersRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return _view(await service.answer(current_user.id, tailored_id, [a.model_dump() for a in req.answers]))


@router.post("/tailored-resumes/{tailored_id}/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_tailored(
    tailored_id: str,
    req: GenerateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return _view(await service.generate(current_user.id, tailored_id, req.approved_edit_ids))


@router.post("/tailored-resumes/{tailored_id}/save")
async def save_tailored(
    tailored_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return _view(await service.save(current_user.id, tailored_id))


@router.post("/tailored-resumes/{tailored_id}/cancel")
async def cancel_tailored(
    tailored_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    return _view(await service.cancel(current_user.id, tailored_id))


@router.delete("/tailored-resumes/{tailored_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_tailored(
    tailored_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
):
    await service.discard(current_user.id, tailored_id)


@router.get("/tailored-resumes/{tailored_id}/download")
async def download_tailored(
    tailored_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[TailoringService, Depends(get_tailoring_service)],
    format: Annotated[str, Query(pattern="^(docx|pdf)$")] = "docx",
):
    path, name, media_type = await service.download(current_user.id, tailored_id, format)
    return FileResponse(path=path, filename=name, media_type=media_type)
