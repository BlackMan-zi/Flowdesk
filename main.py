from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
import os

from core.ratelimit import limiter
from core.security import require_password_reset_complete

# Import all models to ensure they register with SQLAlchemy Base
from database import Base, engine
import models.organization
import models.user
import models.delegation
import models.audit
import models.form
import models.approval
import models.document

# Routers
from routers.auth import router as auth_router
from routers.organizations import router as org_router, dept_router
from routers.users import router as users_router, roles_router
from routers.forms import router as forms_router, templates_router
from routers.approvals import router as approvals_router
from routers.delegations import router as delegations_router
from routers.documents import router as documents_router
from routers.dashboard import router as dashboard_router

from config import settings
from core.bootstrap import ensure_system_admin
from database import SessionLocal


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all database tables on startup
    Base.metadata.create_all(bind=engine)

    # Ensure media directories exist
    os.makedirs(os.path.join(settings.MEDIA_DIR, "documents"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "attachments"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "signatures"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "pdf_templates"), exist_ok=True)

    # Seed built-in system admin
    db = SessionLocal()
    try:
        ensure_system_admin(db)
    finally:
        db.close()

    print("✅ FlowDesk API started. Database tables created.")
    yield
    print("FlowDesk API shutting down.")


# Interactive API docs are a full endpoint/schema map — keep them off in prod.
_docs_enabled = not settings.IS_PRODUCTION
app = FastAPI(
    title="FlowDesk API",
    description="Multi-Tenant SaaS Approval & Workflow Platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Rate limiting (throttles auth brute-force). See core/ratelimit.py.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — explicit origins only. A wildcard origin with credentials would let any
# site drive authenticated cross-origin requests, so we never combine the two.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Business routers require a user who has already rotated their starter password.
# The auth router is exempt so /auth/me and /auth/force-reset-password still work.
_password_gate = [Depends(require_password_reset_complete)]

app.include_router(auth_router)
app.include_router(org_router, dependencies=_password_gate)
app.include_router(dept_router, dependencies=_password_gate)
app.include_router(users_router, dependencies=_password_gate)
app.include_router(roles_router, dependencies=_password_gate)
app.include_router(forms_router, dependencies=_password_gate)
app.include_router(templates_router, dependencies=_password_gate)
app.include_router(approvals_router, dependencies=_password_gate)
app.include_router(delegations_router, dependencies=_password_gate)
app.include_router(documents_router, dependencies=_password_gate)
app.include_router(dashboard_router, dependencies=_password_gate)

# Serve frontend static files (built output)
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/app", StaticFiles(directory=frontend_dist, html=True), name="frontend")

# NOTE: media (generated PDFs, attachments, signatures) is intentionally NOT
# served as public static files. Serving it directly would bypass per-user
# authorization and expose signatures/documents to anyone who guesses a path.
# Documents are downloaded only through the authenticated, org-scoped routes in
# routers/documents.py and routers/forms.py.


@app.get("/")
def root():
    return {
        "message": "FlowDesk API is running",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}