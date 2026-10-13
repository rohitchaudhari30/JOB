"""SEC-10: oversize resumes are rejected while streaming and leave nothing on disk."""
import os

import pytest

from app.core.config import settings


async def _headers(client):
    payload = {"email": "uploader@example.com", "password": "Password123!"}
    await client.post("/api/v1/auth/register", json=payload)
    token = (await client.post("/api/v1/auth/login", json=payload)).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _files(content: bytes):
    return {"file": ("cv.pdf", content, "application/pdf")}


@pytest.mark.asyncio
async def test_oversize_upload_is_rejected_and_not_kept(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_RESUME_SIZE_BYTES", 3000)
    headers = await _headers(client)

    res = await client.post("/api/v1/resumes", files=_files(b"%PDF-" + b"x" * 5000), headers=headers)
    assert res.status_code == 413
    leftovers = [f for _, _, names in os.walk(tmp_path) for f in names]
    assert leftovers == []


@pytest.mark.asyncio
async def test_upload_within_limit_is_saved(client, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path))
    monkeypatch.setattr(settings, "MAX_RESUME_SIZE_BYTES", 3000)
    headers = await _headers(client)

    res = await client.post("/api/v1/resumes", files=_files(b"%PDF-" + b"x" * 1000), headers=headers)
    assert res.status_code == 201, res.text
    saved = [os.path.join(d, f) for d, _, names in os.walk(tmp_path) for f in names]
    assert len(saved) == 1
    assert os.path.getsize(saved[0]) == 1005
