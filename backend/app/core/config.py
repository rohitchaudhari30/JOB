import base64
import logging
import os
import secrets
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


logger = logging.getLogger(__name__)

# Environments where it is acceptable to run with generated throw-away secrets.
DEV_ENVIRONMENTS = {"development", "dev", "local", "test", "testing"}

# Values that used to be hard-coded defaults. They are public, so never accept them.
KNOWN_INSECURE_VALUES = {
    "default_insecure_development_secret_key_change_in_production_123456",
    "dGVzdF9rZXlfdGhhdF9pczMzX2J5dGVzX2xvbmdfMTIzNDU2Nzg=",
    "your_secret_key_here",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Application & Environment
    # Safe by default: anything that is not explicitly a dev/test environment
    # must provide real secrets (see validate_production_secrets).
    APP_ENV: str = "production"
    APP_NAME: str = "Job Automation Platform"
    APP_PORT: int = 8000
    DEBUG: bool = False
    # Create demo.engineer@example.com on startup. Local development only.
    SEED_DEMO_USER: bool = False
    SECRET_KEY: str = ""
    ENCRYPTION_KEY: str = ""
    # Key rotation: put the old ENCRYPTION_KEY here (comma-separated if several) so data
    # encrypted before the change can still be read. New data always uses ENCRYPTION_KEY.
    ENCRYPTION_KEY_PREVIOUS: str = ""

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"

    # Task Queue & Cache

    # AI Providers
    GROQ_API_KEY: str = ""
    GROQ_DEFAULT_MODEL: str = "openai/gpt-oss-120b"
    GROQ_MAX_TOKENS: int = 2048
    GROQ_TEMPERATURE: float = 0.2

    GEMINI_API_KEY: str = ""
    GEMINI_DEFAULT_MODEL: str = "gemini-2.0-flash"
    GEMINI_PRO_MODEL: str = "gemini-1.5-pro"

    # Browser Automation
    BROWSER_HEADLESS: bool = True
    BROWSER_TIMEOUT_MS: int = 30000
    BROWSER_USER_DATA_DIR: str = "./storage/browser_profiles"
    BROWSER_TRACE_ON_FAILURE: bool = True
    STORAGE_DIR: str = "./storage"

    # Security & Session
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # Active session access token (60 mins)
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7     # Revocable refresh token lifespan (7 days)
    SESSION_COOKIE_MAX_AGE_DAYS: int = 30
    # Comma-separated emails allowed to run destructive, shared-data operations
    # (e.g. deleting jobs, which are shared by every user). Empty = nobody.
    ADMIN_EMAILS: str = ""
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Auth abuse protection (SEC-06). Starting values; the product owner should tune them.
    PASSWORD_MIN_LENGTH: int = 8
    AUTH_RATE_LIMIT_ATTEMPTS: int = 10      # per client IP, per window. 0 turns the limit off.
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 60

    # Let the automation browser open localhost / private addresses (dev and tests only).
    ALLOW_PRIVATE_APPLY_URLS: bool = False

    # Upload & Defense in Depth
    # Hiding automation from websites may break their terms of use (COMP-01), so it is opt-in.
    BROWSER_STEALTH_ENABLED: bool = False
    MAX_RESUME_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB maximum
    ALLOWED_RESUME_EXTENSIONS: str = ".pdf,.docx"

    # Rate Limiting & Safety
    DEFAULT_MAX_CONCURRENT_SESSIONS: int = 2
    DEFAULT_COOLDOWN_SECONDS: int = 5
    MAX_DAILY_APPLICATIONS_DEFAULT: int = 25
    GLOBAL_ACCOUNT_SAFE_CEILING: int = 50
    PLATFORM_DAILY_CAP_DEFAULT: int = 30

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_resume_extensions_list(self) -> List[str]:
        return [ext.strip().lower() for ext in self.ALLOWED_RESUME_EXTENSIONS.split(",") if ext.strip()]

    @property
    def is_dev_environment(self) -> bool:
        return self.APP_ENV.lower() in DEV_ENVIRONMENTS

    def validate_production_secrets(self) -> None:
        """Fail closed: real secrets are required unless APP_ENV is dev/test.

        In dev/test, missing secrets are replaced by random per-process ones
        (never a key that is public in the repository).
        """
        if self.is_dev_environment:
            if not self.SECRET_KEY or self.SECRET_KEY in KNOWN_INSECURE_VALUES:
                logger.warning("SECRET_KEY not set: using a random key for this process (dev only).")
                self.SECRET_KEY = secrets.token_urlsafe(48)
            if not self.ENCRYPTION_KEY or self.ENCRYPTION_KEY in KNOWN_INSECURE_VALUES:
                logger.warning("ENCRYPTION_KEY not set: using a random key for this process (dev only).")
                self.ENCRYPTION_KEY = base64.b64encode(secrets.token_bytes(32)).decode()
            return

        if not self.SECRET_KEY or self.SECRET_KEY in KNOWN_INSECURE_VALUES or len(self.SECRET_KEY) < 32:
            raise ValueError(
                "FATAL SECURITY MISCONFIGURATION: SECRET_KEY must be a random string of at least "
                "32 characters, provided via environment variables or a secret manager."
            )
        if not self.ENCRYPTION_KEY or self.ENCRYPTION_KEY in KNOWN_INSECURE_VALUES:
            raise ValueError(
                "FATAL SECURITY MISCONFIGURATION: ENCRYPTION_KEY must be a 32-byte base64-encoded "
                "AES key provided via environment variables or a secret manager."
            )


settings = Settings()
settings.validate_production_secrets()
