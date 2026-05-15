"""
Organization-level settings & branding.

The header/footer images uploaded here are reused as letterhead on every
form's exported PDF — so admins only design their letterhead once. Phase A
of the form-architecture redesign.
"""
import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from database import get_db
from models.organization import Organization
from models.user import User, RoleName
from schemas.organization import OrganizationResponse, OrganizationUpdate
from core.security import get_current_active_user
from core.permissions import require_roles
from config import settings as app_settings

router = APIRouter(prefix="/settings", tags=["Settings"])


ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 4 MB


def _branding_dir(org_id: str) -> str:
    path = os.path.join(app_settings.MEDIA_DIR, "branding", org_id)
    os.makedirs(path, exist_ok=True)
    return path


def _save_image(file: UploadFile, dest_path: str) -> None:
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, or WEBP images are allowed.")
    # Stream to disk, enforce size limit
    total = 0
    with open(dest_path, "wb") as out:
        while True:
            chunk = file.file.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_IMAGE_BYTES:
                out.close()
                os.remove(dest_path)
                raise HTTPException(status_code=400, detail="Image exceeds 4 MB limit.")
            out.write(chunk)


# ── Organization profile ──────────────────────────────────────────────────────

@router.get("/organization", response_model=OrganizationResponse)
def get_my_organization(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/organization", response_model=OrganizationResponse)
def update_my_organization(
    payload: OrganizationUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(org, field, value)
    db.commit()
    db.refresh(org)
    return org


# ── Header / footer images ────────────────────────────────────────────────────

@router.post("/organization/header", response_model=OrganizationResponse)
async def upload_header_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() or "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        ext = "png"
    dest = os.path.join(_branding_dir(org.id), f"header.{ext}")
    # Remove any previous header file with a different extension
    for prev_ext in ("png", "jpg", "jpeg", "webp"):
        prev = os.path.join(_branding_dir(org.id), f"header.{prev_ext}")
        if prev != dest and os.path.exists(prev):
            os.remove(prev)
    _save_image(file, dest)
    org.header_image_path = dest
    db.commit()
    db.refresh(org)
    return org


@router.post("/organization/footer", response_model=OrganizationResponse)
async def upload_footer_image(
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() or "png"
    if ext not in ("png", "jpg", "jpeg", "webp"):
        ext = "png"
    dest = os.path.join(_branding_dir(org.id), f"footer.{ext}")
    for prev_ext in ("png", "jpg", "jpeg", "webp"):
        prev = os.path.join(_branding_dir(org.id), f"footer.{prev_ext}")
        if prev != dest and os.path.exists(prev):
            os.remove(prev)
    _save_image(file, dest)
    org.footer_image_path = dest
    db.commit()
    db.refresh(org)
    return org


@router.delete("/organization/header", response_model=OrganizationResponse)
def delete_header_image(
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.header_image_path and os.path.exists(org.header_image_path):
        os.remove(org.header_image_path)
    org.header_image_path = None
    db.commit()
    db.refresh(org)
    return org


@router.delete("/organization/footer", response_model=OrganizationResponse)
def delete_footer_image(
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    if org.footer_image_path and os.path.exists(org.footer_image_path):
        os.remove(org.footer_image_path)
    org.footer_image_path = None
    db.commit()
    db.refresh(org)
    return org


@router.get("/organization/header")
def serve_header_image(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Serve the org's header image. Auth-gated so it isn't world-readable."""
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org or not org.header_image_path or not os.path.exists(org.header_image_path):
        raise HTTPException(status_code=404, detail="No header image")
    return FileResponse(org.header_image_path)


@router.get("/organization/footer")
def serve_footer_image(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org or not org.footer_image_path or not os.path.exists(org.footer_image_path):
        raise HTTPException(status_code=404, detail="No footer image")
    return FileResponse(org.footer_image_path)
