from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.organization import Organization, Department
from models.user import User
from schemas.organization import (
    OrganizationCreate, OrganizationUpdate, OrganizationResponse,
    DepartmentCreate, DepartmentUpdate, DepartmentResponse
)
from core.security import get_current_active_user
from core.permissions import require_roles
from models.user import RoleName
from services import audit_service

router = APIRouter(prefix="/organizations", tags=["Organizations"])


@router.post("", response_model=OrganizationResponse)
def create_organization(
    payload: OrganizationCreate,
    db: Session = Depends(get_db)
):
    """Create a new organization (no auth — used during provisioning)."""
    existing = db.query(Organization).filter(
        Organization.subdomain == payload.subdomain
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Subdomain already taken")

    org = Organization(**payload.model_dump())
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrganizationResponse)
def get_organization(
    org_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.patch("/{org_id}", response_model=OrganizationResponse)
def update_organization(
    org_id: str,
    payload: OrganizationUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    if current_user.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Access denied")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(org, field, value)
    db.commit()
    db.refresh(org)
    return org


# ── DEPARTMENTS ──────────────────────────────────────────────────────────────

dept_router = APIRouter(prefix="/departments", tags=["Departments"])


@dept_router.post("", response_model=DepartmentResponse)
def create_department(
    payload: DepartmentCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    dept = Department(
        organization_id=current_user.organization_id,
        **payload.model_dump()
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    audit_service.log_event(
        db, current_user.organization_id, "DEPARTMENT_CREATED",
        user_id=current_user.id, entity_type="Department", entity_id=dept.id
    )
    return dept


@dept_router.get("", response_model=List[DepartmentResponse])
def list_departments(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    from sqlalchemy import func
    depts = db.query(Department).filter(
        Department.organization_id == current_user.organization_id,
        Department.is_active == True
    ).all()
    # Attach member counts
    counts = dict(
        db.query(User.department_id, func.count(User.id))
        .filter(User.organization_id == current_user.organization_id)
        .group_by(User.department_id)
        .all()
    )
    results = []
    for d in depts:
        item = DepartmentResponse.model_validate(d)
        item.member_count = counts.get(d.id, 0)
        results.append(item)
    return results


@dept_router.patch("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: str,
    payload: DepartmentUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    dept = db.query(Department).filter(
        Department.id == dept_id,
        Department.organization_id == current_user.organization_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(dept, field, value)
    db.commit()
    db.refresh(dept)
    return dept


@dept_router.delete("/{dept_id}", status_code=204)
def delete_department(
    dept_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    dept = db.query(Department).filter(
        Department.id == dept_id,
        Department.organization_id == current_user.organization_id
    ).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    # Check if any users are assigned
    member_count = db.query(User).filter(User.department_id == dept_id).count()
    if member_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {member_count} user(s) are assigned to this department. Reassign them first."
        )
    dept.is_active = False
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "DEPARTMENT_DELETED",
        user_id=current_user.id, entity_type="Department", entity_id=dept.id
    )
