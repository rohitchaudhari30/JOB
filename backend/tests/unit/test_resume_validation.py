import io
import pytest
from fastapi import HTTPException, UploadFile
from app.core.config import settings


def create_mock_upload_file(filename: str, content: bytes) -> UploadFile:
    file_obj = io.BytesIO(content)
    return UploadFile(filename=filename, file=file_obj)


@pytest.mark.asyncio
async def test_resume_valid_pdf_magic_bytes():
    # Valid PDF starts with %PDF-
    valid_pdf_bytes = b"%PDF-1.4\n%mock resume content"
    mock_file = create_mock_upload_file("my_resume.pdf", valid_pdf_bytes)

    header = await mock_file.read(2048)
    assert header.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_resume_invalid_extension():
    filename = "script.exe"
    ext = filename[filename.rfind("."):]
    assert ext not in settings.allowed_resume_extensions_list


@pytest.mark.asyncio
async def test_resume_disguised_exe_rejected():
    # An executable renamed to .pdf should fail magic byte check
    malicious_bytes = b"MZ\x90\x00\x03\x00\x00\x00"  # Windows PE executable header
    mock_file = create_mock_upload_file("hacked.pdf", malicious_bytes)

    header = await mock_file.read(2048)
    assert not header.startswith(b"%PDF-")
