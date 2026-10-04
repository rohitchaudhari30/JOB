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
    GEMINI_DEFAULT_MODEL: str = "gemini-2.5-flash"
    GEMINI_PRO_MODEL: str = "gemini-2.5-pro"

    # Browser Automation
    BROWSER_HEADLESS: bool = False
    BROWSER_TIMEOUT_MS: int = 30000
    BROWSER_USER_DATA_DIR: str = "./storage/browser_profiles"
    BROWSER_TRACE_ON_FAILURE: bool = True
    STORAGE_DIR: str = "./storage"

    # Security & Session
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours
    SESSION_COOKIE_MAX_AGE_DAYS: int = 30
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Rate Limiting & Safety
    DEFAULT_MAX_CONCURRENT_SESSIONS: int = 2
    DEFAULT_COOLDOWN_SECONDS: int = 5
    MAX_DAILY_APPLICATIONS_DEFAULT: int = 25

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
