from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.user import User, Role, UserRole, UserStatus, RoleName
from models.organization import Organization
from schemas.user import (
    UserCreate, UserUpdate, UserResponse, RoleCreate, RoleResponse,
    TempPasswordResponse,
)
from core.security import get_current_active_user
from core.permissions import require_roles
from services.auth_service import hash_password, generate_temp_password
from services.email_service import send_temp_credentials_email, send_temp_password_reset_email
from services import audit_service

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

@router.post("", response_model=TempPasswordResponse, status_code=201)
def create_user(
    payload: UserCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin creates a user with a one-time temporary password.

    The plain temp password is returned to the admin once and never stored —
    only its bcrypt hash is persisted. Email delivery is best-effort so a dead
    mail server can never block onboarding.
    """
    # Check email uniqueness within org
    existing = db.query(User).filter(
        User.email == payload.email.lower(),
        User.organization_id == current_user.organization_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered in this organization")

    temp_pw = generate_temp_password()

    user = User(
        organization_id=current_user.organization_id,
        name=payload.name,
        email=payload.email.lower(),
        password_hash=hash_password(temp_pw),
        temp_password=None,          # never persist the plaintext
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

    # Best-effort: a dead mail server must never block onboarding.
    email_sent = False
    try:
        send_temp_credentials_email(user.email, user.name, temp_pw, org.name if org else "FlowDesk")
        email_sent = True
    except Exception as e:
        print(f"[WARNING] Welcome email not sent for {user.email}: {e}")

    audit_service.log_event(
        db, current_user.organization_id, "USER_CREATED",
        user_id=current_user.id, entity_type="User", entity_id=user.id,
        details={"created_user_email": user.email}
    )

    return TempPasswordResponse(
        id=user.id, name=user.name, email=user.email,
        temp_password=temp_pw, email_sent=email_sent,
    )


@router.post("/{user_id}/reset-password", response_model=TempPasswordResponse)
def reset_user_password(
    user_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin resets a user's password to a new one-time temp password.

    Returns the plain temp password once (never stored). Admins reset their own
    password through the change-password flow, not here.
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Use the change-password flow for your own account")

    temp_pw = generate_temp_password()
    user.password_hash = hash_password(temp_pw)
    user.temp_password = None
    user.must_reset_password = True
    db.commit()

    email_sent = False
    try:
        send_temp_password_reset_email(user.email, user.name, temp_pw, current_user.name)
        email_sent = True
    except Exception as e:
        print(f"[WARNING] Reset email not sent for {user.email}: {e}")

    audit_service.log_event(
        db, current_user.organization_id, "PASSWORD_RESET_BY_ADMIN",
        user_id=current_user.id, entity_type="User", entity_id=user.id
    )

    return TempPasswordResponse(
        id=user.id, name=user.name, email=user.email,
        temp_password=temp_pw, email_sent=email_sent,
    )


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
