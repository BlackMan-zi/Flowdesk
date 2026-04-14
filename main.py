from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all database tables on startup
    Base.metadata.create_all(bind=engine)

    # Ensure media directories exist
    os.makedirs(os.path.join(settings.MEDIA_DIR, "documents"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "attachments"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "signatures"), exist_ok=True)
    os.makedirs(os.path.join(settings.MEDIA_DIR, "pdf_templates"), exist_ok=True)

    print("✅ FlowDesk API started. Database tables created.")
    yield
    print("FlowDesk API shutting down.")


app = FastAPI(
    title="FlowDesk API",
    description="Multi-Tenant SaaS Approval & Workflow Platform",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production to specific frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
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

# Serve frontend static files (built output)
frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/app", StaticFiles(directory=frontend_dist, html=True), name="frontend")

# Serve media files
media_dir = settings.MEDIA_DIR
if os.path.exists(media_dir):
    app.mount("/media", StaticFiles(directory=media_dir), name="media")


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