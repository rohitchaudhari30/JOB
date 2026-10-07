import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # Application & Environment
    APP_ENV: str = "development"
    APP_NAME: str = "Job Automation Platform"
    APP_PORT: int = 8000
    DEBUG: bool = True
    SECRET_KEY: str = "default_insecure_development_secret_key_change_in_production_123456"
    ENCRYPTION_KEY: str = "dGVzdF9rZXlfdGhhdF9pczMzX2J5dGVzX2xvbmdfMTIzNDU2Nzg="  # 32-byte base64 default for dev

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"

    # Task Queue & Cache
    TASK_QUEUE_BACKEND: str = "local"  # "local" | "redis"
    REDIS_URL: str = "redis://localhost:6379/0"

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # Short-lived access token
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7     # Revocable refresh token lifespan
    SESSION_COOKIE_MAX_AGE_DAYS: int = 30
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Upload & Defense in Depth
    MAX_RESUME_SIZE_BYTES: int = 10 * 1024 * 1024  # 10 MB maximum
    ALLOWED_RESUME_EXTENSIONS: str = ".pdf,.docx"

    # Rate Limiting & Safety
    DEFAULT_MAX_CONCURRENT_SESSIONS: int = 2
    DEFAULT_COOLDOWN_SECONDS: int = 5
    MAX_DAILY_APPLICATIONS_DEFAULT: int = 25

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def allowed_resume_extensions_list(self) -> List[str]:
        return [ext.strip().lower() for ext in self.ALLOWED_RESUME_EXTENSIONS.split(",") if ext.strip()]

    def validate_production_secrets(self) -> None:
        """Enforces fail-fast production security standards."""
        is_prod = self.APP_ENV.lower() in ("production", "prod", "staging") or not self.DEBUG
        if is_prod:
            insecure_secret = "default_insecure_development_secret_key_change_in_production_123456"
            if not self.SECRET_KEY or self.SECRET_KEY == insecure_secret or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "FATAL SECURITY MISCONFIGURATION: In production, SECRET_KEY must be a cryptographically secure random string (minimum 32 characters) provided via environment variables or secret manager."
                )

            insecure_enc = "dGVzdF9rZXlfdGhhdF9pczMzX2J5dGVzX2xvbmdfMTIzNDU2Nzg="
            if not self.ENCRYPTION_KEY or self.ENCRYPTION_KEY == insecure_enc:
                raise ValueError(
                    "FATAL SECURITY MISCONFIGURATION: In production, ENCRYPTION_KEY must be a 32-byte base64-encoded AES key provided via environment variables or secret manager."
                )


settings = Settings()
settings.validate_production_secrets()
