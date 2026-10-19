"""Everything the app stores about one user, as JSON (GDPR-style "download my data").

Allow-list on purpose: a table added later is NOT exported until someone decides it should be, and
credentials never are. Passwords, tokens, saved browser sessions (cookies) and server file paths are
left out; uploaded resume files are not included, only their records.
"""
import datetime as dt
import enum
from typing import Any, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base
from app.infrastructure.database.repositories.user_data_eraser import _owned_table_filters

EXPORT_TABLES = (
    "candidate_profiles", "candidate_skills", "experiences", "educations", "resumes", "saved_answers",
    "applications", "application_events", "application_questions", "match_results",
    "campaigns", "campaign_rules", "campaign_safety_policies", "campaign_schedules",
    "campaign_executions", "automation_runs",
)
# Dropped from every exported row.
HIDDEN_COLUMNS = {"file_path", "screenshot_file_path", "trace_file_path", "hashed_password", "encrypted_storage_state"}
ROW_CAP_PER_TABLE = 50_000


def _plain(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, bytes):
        return None
    return value


async def export_user_data(session: AsyncSession, user: Any) -> Dict[str, Any]:
    filters = _owned_table_filters(user.id)
    data: Dict[str, Any] = {
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "account": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "created_at": _plain(user.created_at),
        },
        "tables": {},
    }
    for name in EXPORT_TABLES:
        table = Base.metadata.tables.get(name)
        if table is None or table not in filters:
            continue
        columns = [c for c in table.c if c.name not in HIDDEN_COLUMNS]
        rows = (await session.execute(select(*columns).where(filters[table]).limit(ROW_CAP_PER_TABLE))).mappings().all()
        data["tables"][name] = [{k: _plain(v) for k, v in row.items()} for row in rows]
    return data
