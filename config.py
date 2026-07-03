from pydantic_settings import BaseSettings
from typing import Optional, List


class Settings(BaseSettings):
    # Deployment environment: "development" | "production". Controls whether the
    # interactive API docs are exposed and how strict a few defaults are.
    ENVIRONMENT: str = "development"

    # Database — required, no default (must be supplied via env / .env)
    DATABASE_URL: str

    # JWT — required, no default. Generate with: openssl rand -hex 32
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS — comma-separated list of allowed browser origins. Never "*" together
    # with credentials. Parsed from a string so it can come straight from .env.
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    # Uploads — hard limits enforced server-side (nginx also caps at the edge).
    MAX_UPLOAD_SIZE_MB: int = 20

    # HTTPS enforcement flag (surfaced for deployment tooling / future middleware).
    REQUIRE_HTTPS: bool = False

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

    @property
    def IS_PRODUCTION(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def allowed_origins_list(self) -> List[str]:
        """ALLOWED_ORIGINS parsed into a clean list of origins."""
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def MAX_UPLOAD_SIZE_BYTES(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024


settings = Settings()
