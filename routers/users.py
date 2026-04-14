from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.user import User, Role, UserRole, UserStatus, RoleName
from models.organization import Organization
from schemas.user import UserCreate, UserUpdate, UserResponse, RoleCreate, RoleResponse
from core.security import get_current_active_user
from core.permissions import require_roles
from services.auth_service import hash_password, generate_temp_password
from services.email_service import send_temp_credentials_email
from services import audit_service
import secrets

router = APIRouter(prefix="/users", tags=["Users"])
roles_router = APIRouter(prefix="/roles", tags=["Roles"])


# ── ROLES ─────────────────────────────────────────────────────────────────────

@roles_router.post("", response_model=RoleResponse)
def create_role(
    payload: RoleCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    role = Role(
        organization_id=current_user.organization_id,
        name=payload.name,
        role_category=payload.role_category,
        description=payload.description
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return role


@roles_router.get("", response_model=List[RoleResponse])
def list_roles(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    return db.query(Role).filter(
        Role.organization_id == current_user.organization_id,
        Role.is_active == True
    ).all()


# ── USERS ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=UserResponse)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin creates a user. Initial password = user's email."""
    # Check email uniqueness within org
    existing = db.query(User).filter(
        User.email == payload.email.lower(),
        User.organization_id == current_user.organization_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered in this organization")

    # Initial password is the user's own email (they must reset on first login)
    temp_pw = payload.email.lower()

    user = User(
        organization_id=current_user.organization_id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(temp_pw),
        temp_password=temp_pw,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        sn_manager_id=payload.sn_manager_id,
        hod_id=payload.hod_id,
        status=UserStatus.pending,
        must_reset_password=True
    )
    db.add(user)
    db.flush()

    # Assign roles
    for role_id in payload.role_ids:
        role = db.query(Role).filter(
            Role.id == role_id,
            Role.organization_id == current_user.organization_id
        ).first()
        if role:
            db.add(UserRole(user_id=user.id, role_id=role.id, assigned_by=current_user.id))

    db.commit()
    db.refresh(user)

    # Get org for email
    org = db.query(Organization).filter(
        Organization.id == current_user.organization_id
    ).first()

    # Send temp credentials
    try:
        send_temp_credentials_email(user.email, user.name, temp_pw, org.name if org else "FlowDesk")
    except Exception as e:
        print(f"[WARNING] Email send failed: {e}")

    audit_service.log_event(
        db, current_user.organization_id, "USER_CREATED",
        user_id=current_user.id, entity_type="User", entity_id=user.id,
        details={"created_user_email": user.email}
    )

    # Build response with roles
    user.roles = [ur.role for ur in user.user_roles if ur.role]
    return user


@router.get("", response_model=List[UserResponse])
def list_users(
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    users = db.query(User).filter(
        User.organization_id == current_user.organization_id
    ).all()
    for u in users:
        u.roles = [ur.role for ur in u.user_roles if ur.role]
    return users


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Users can view themselves; admins can view anyone in org
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.roles = [ur.role for ur in user.user_roles if ur.role]
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    payload: UserUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = payload.model_dump(exclude_unset=True, exclude={"role_ids"})

    # Check email uniqueness if being changed
    if "email" in update_data:
        update_data["email"] = update_data["email"].lower()
        conflict = db.query(User).filter(
            User.email == update_data["email"],
            User.organization_id == current_user.organization_id,
            User.id != user_id
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use by another user.")

    for field, value in update_data.items():
        setattr(user, field, value)

    # Update roles if provided
    if payload.role_ids is not None:
        # Remove existing
        db.query(UserRole).filter(UserRole.user_id == user.id).delete()
        for role_id in payload.role_ids:
            role = db.query(Role).filter(
                Role.id == role_id,
                Role.organization_id == current_user.organization_id
            ).first()
            if role:
                db.add(UserRole(user_id=user.id, role_id=role.id, assigned_by=current_user.id))

    db.commit()
    db.refresh(user)

    audit_service.log_event(
        db, current_user.organization_id, "USER_UPDATED",
        user_id=current_user.id, entity_type="User", entity_id=user.id
    )

    user.roles = [ur.role for ur in user.user_roles if ur.role]
    return user


@router.delete("/{user_id}")
def deactivate_user(
    user_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    user.status = UserStatus.not_active
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "USER_DEACTIVATED",
        user_id=current_user.id, entity_type="User", entity_id=user.id
    )
    return {"message": "User deactivated"}
