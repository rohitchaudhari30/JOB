"""PRV-01: a user can delete their account and all personal data."""
import os

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.infrastructure.database.models.models import (
    CandidateProfileModel,
    CandidateSkillModel,
    ResumeModel,
    UserModel,
)

PASSWORD = "Password123!"


async def _signup(client, email):
    data = (await client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})).json()
    return {"Authorization": f"Bearer {data['access_token']}"}


async def _fill_account(client, headers, skill):
    await client.put(
        "/api/v1/profile",
        json={"headline": "Dev", "skills": [{"skill_name": skill, "years_experience": 2}]},
        headers=headers,
    )
    files = {"file": ("cv.pdf", b"%PDF-" + b"x" * 100, "application/pdf")}
    res = await client.post("/api/v1/resumes", files=files, headers=headers)
    assert res.status_code == 201, res.text


async def _count(db, model):
    return await db.scalar(select(func.count()).select_from(model))


@pytest.mark.asyncio
async def test_wrong_password_does_not_delete(client, db_session):
    headers = await _signup(client, "stays@example.com")
    res = await client.request("DELETE", "/api/v1/auth/me", json={"password": "nope-nope"}, headers=headers)
    assert res.status_code == 403
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200


@pytest.mark.asyncio
async def test_delete_removes_only_that_users_data(client, db_session, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path))
    gone = await _signup(client, "leaving@example.com")
    stays = await _signup(client, "remaining@example.com")
    await _fill_account(client, gone, "Python")
    await _fill_account(client, stays, "Go")
    files_before = [f for _, _, names in os.walk(tmp_path) for f in names]
    assert len(files_before) == 2

    res = await client.request("DELETE", "/api/v1/auth/me", json={"password": PASSWORD}, headers=gone)
    assert res.status_code == 204

    # The old token no longer works.
    assert (await client.get("/api/v1/auth/me", headers=gone)).status_code == 401

    db_session.expire_all()
    emails = (await db_session.scalars(select(UserModel.email))).all()
    assert emails == ["remaining@example.com"]
    assert await _count(db_session, CandidateProfileModel) == 1
    assert await _count(db_session, ResumeModel) == 1
    skills = (await db_session.scalars(select(CandidateSkillModel.skill_name))).all()
    assert skills == ["Go"]

    # Only the remaining user's resume file is left on disk.
    assert len([f for _, _, names in os.walk(tmp_path) for f in names]) == 1
    # The other user is untouched and can still log in.
    assert (await client.get("/api/v1/auth/me", headers=stays)).status_code == 200
