from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional, List
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+psycopg2://flowdesk_user:password@flowdesk-db:5432/flowdesk"

    # JWT
    SECRET_KEY: str  # Required – must be set in .env
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    MFA_PENDING_TOKEN_EXPIRE_MINUTES: int = 10

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "noreply@flowdesk.app"
    SMTP_TLS: bool = True
    # Kill switch for testing against real user data without actually
    # notifying anyone — every send is skipped (treated the same as a
    # failed send, which every caller already handles gracefully).
    EMAIL_NOTIFICATIONS_ENABLED: bool = True

    # Application
    APP_NAME: str = "FlowDesk"
    FRONTEND_URL: str = "http://localhost:3000"
    MEDIA_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "media")

    # Uploads: hard limit enforced server-side (nginx also caps at the edge).
    MAX_UPLOAD_SIZE_MB: int = 20

    # Security
    REQUIRE_HTTPS: bool = True
    ENVIRONMENT: str = "development"  # development, staging, production

    SUPER_ADMIN_EMAIL: Optional[str] = None

    @field_validator("SECRET_KEY")
    @classmethod
    def validate_secret_key(cls, v: str) -> str:
        if v == "change-this-secret-key-in-production":
            raise ValueError(
                "SECRET_KEY is using the default placeholder! "
                "Generate a secure key: openssl rand -hex 32"
            )
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v

    @field_validator("ALLOWED_ORIGINS")
    @classmethod
    def validate_origins(cls, v: List[str], info) -> List[str]:
        environment = info.data.get("ENVIRONMENT", "development")
        if environment == "production" and v == ["http://localhost:3000"]:
            raise ValueError(
                "ALLOWED_ORIGINS must be explicitly configured for production! "
                "Set ALLOWED_ORIGINS in .env"
            )
        return v

    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
        env_file_encoding = "utf-8"

    @property
    def MAX_UPLOAD_SIZE_BYTES(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


try:
    settings = Settings()
except Exception as e:
    raise RuntimeError(f"⚠️  Configuration Error: {str(e)}")

if settings.ENVIRONMENT == "production":
    if settings.REQUIRE_HTTPS and "https" not in settings.FRONTEND_URL:
        print("⚠️  WARNING: FRONTEND_URL should use HTTPS in production")
    if "*" in settings.ALLOWED_ORIGINS:
        raise RuntimeError("CORS allow_origins=['*'] is not allowed in production!")
