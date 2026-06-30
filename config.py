from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database — required, no default (must be supplied via env / .env)
    DATABASE_URL: str

    # JWT — required, no default. Generate with: openssl rand -hex 32
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = "noreply@flowdesk.app"
    SMTP_TLS: bool = True

    # Application
    APP_NAME: str = "FlowDesk"
    FRONTEND_URL: str = "http://localhost:3000"
    MEDIA_DIR: str = "media"

    # Bootstrap admin (created on first startup). Password is optional:
    # if unset, a random one is generated and logged once at startup.
    SUPER_ADMIN_EMAIL: Optional[str] = None
    SUPER_ADMIN_PASSWORD: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
