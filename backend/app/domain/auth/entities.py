from dataclasses import dataclass
from datetime import datetime


@dataclass
class User:
    id: str
    email: str
    hashed_password: str
    full_name: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    created_at: datetime | None = None
    updated_at: datetime | None = None
    tokens_valid_after: datetime | None = None


@dataclass
class UserSession:
    id: str
    user_id: str
    jwt_token_hash: str
    user_agent: str | None = None
    ip_address: str | None = None
    expires_at: datetime | None = None
    created_at: datetime | None = None
