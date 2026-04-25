from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import os
import logging
from datetime import datetime, timezone

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from database import Base, engine
import models.organization
import models.user
import models.delegation
import models.audit
import models.form
import models.approval
import models.document

from routers.auth import router as auth_router
from routers.organizations import router as org_router, dept_router
from routers.users import router as users_router, roles_router
from routers.forms import router as forms_router, templates_router
from routers.approvals import router as approvals_router
from routers.delegations import router as delegations_router
from routers.documents import router as documents_router
from routers.dashboard import router as dashboard_router

from config import settings

limiter = Limiter(key_func=get_remote_address)

# Root of the repo (one level up from backend/)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    os.makedirs(os.path.join(settings.MEDIA_DIR, "documents"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "attachments"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "signatures"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "pdf_templates"), exist_ok=True)

    logger.info(f"FlowDesk API started ({settings.ENVIRONMENT} mode)")
    logger.info(f"Database: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"CORS origins: {settings.ALLOWED_ORIGINS}")

    yield

    logger.info("FlowDesk API shutting down")


app = FastAPI(
    title="FlowDesk API",
    description="Multi-Tenant SaaS Approval & Workflow Platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.state.limiter = limiter

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["*"],
    max_age=600,
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "detail": str(exc.detail),
            "retry_after": exc.headers.get("Retry-After", "60")
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    if settings.ENVIRONMENT == "production":
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error", "request_id": request.headers.get("X-Request-ID")}
        )
    else:
        return JSONResponse(
            status_code=500,
            content={"error": str(exc), "type": type(exc).__name__}
        )


app.include_router(auth_router)
app.include_router(org_router)
app.include_router(dept_router)
app.include_router(users_router)
app.include_router(roles_router)
app.include_router(forms_router)
app.include_router(templates_router)
app.include_router(approvals_router)
app.include_router(delegations_router)
app.include_router(documents_router)
app.include_router(dashboard_router)

# frontend/dist is at repo root level, one level up from backend/
frontend_dist = os.path.join(REPO_ROOT, "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/app", StaticFiles(directory=frontend_dist, html=True), name="frontend")
    logger.info(f"Frontend mounted at /app from {frontend_dist}")

if os.path.exists(settings.MEDIA_DIR):
    app.mount("/media", StaticFiles(directory=settings.MEDIA_DIR), name="media")
    logger.info(f"Media files mounted at /media from {settings.MEDIA_DIR}")


@app.get("/")
@limiter.limit("100/minute")
def root(request: Request):
    return {
        "message": "FlowDesk API is running",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
@limiter.limit("1000/minute")
def health(request: Request):
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
