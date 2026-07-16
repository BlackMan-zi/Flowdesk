from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.user import User, Role, UserRole, UserStatus, RoleName, RoleCategory
from models.organization import Organization
from schemas.user import (
    UserCreate, UserUpdate, UserResponse, RoleCreate, RoleUpdate, RoleResponse,
    AdminPasswordResetRequest, AdminPasswordResetResponse,
    MFARequiredUpdate, MFABulkApplyRequest
)
from core.security import get_current_active_user
from core.permissions import require_roles
from services.auth_service import hash_password, generate_temp_password
from services.email_service import send_temp_credentials_email, send_password_reset_code_email
from services import audit_service
from datetime import datetime
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


@roles_router.patch("/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: str,
    payload: RoleUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    role = db.query(Role).filter(
        Role.id == role_id,
        Role.organization_id == current_user.organization_id
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.role_category in (RoleCategory.system, RoleCategory.hierarchy):
        raise HTTPException(status_code=400, detail="System and hierarchy roles cannot be renamed.")

    role.name = payload.name.strip()
    if payload.description is not None:
        role.description = payload.description
    db.commit()
    db.refresh(role)
    audit_service.log_event(
        db, current_user.organization_id, "ROLE_UPDATED",
        user_id=current_user.id, entity_type="Role", entity_id=role_id,
        details={"new_name": role.name}
    )
    return role


@roles_router.delete("/{role_id}", status_code=204)
def delete_role(
    role_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    from models.approval import ApprovalTemplateStep, ApprovalTemplateCCRecipient

    role = db.query(Role).filter(
        Role.id == role_id,
        Role.organization_id == current_user.organization_id
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    if role.role_category in (RoleCategory.system, RoleCategory.hierarchy):
        raise HTTPException(status_code=400, detail="System and hierarchy roles cannot be deleted.")

    template_usage = db.query(ApprovalTemplateStep).filter(
        ApprovalTemplateStep.role_id == role_id
    ).count()
    if template_usage > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: this role is used in {template_usage} approval template step(s). Remove it from those templates first."
        )

    cc_usage = db.query(ApprovalTemplateCCRecipient).filter(
        ApprovalTemplateCCRecipient.role_id == role_id
    ).count()
    if cc_usage > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: this role is used as a CC recipient in {cc_usage} template(s). Remove it first."
        )

    assigned_count = db.query(UserRole).filter(UserRole.role_id == role_id).count()
    if assigned_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {assigned_count} user(s) currently hold this role. Unassign it from all users first."
        )

    role.is_active = False
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "ROLE_DELETED",
        user_id=current_user.id, entity_type="Role", entity_id=role_id,
        details={"role_name": role.name}
    )


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

    # Send temp credentials, unless the caller explicitly opted out (e.g.
    # bulk/demo user creation where no real mailbox should ever be hit)
    if payload.send_welcome_email:
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


@router.get("/directory")
def list_users_directory(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Minimal user listing for picker UIs (delegation, CC, etc.).

    Any authenticated user in the org can call this. Returns only id/name/email
    for active users, no roles, no admin-only fields. Use the full GET /users
    (admin-only) when you need the complete profile.
    """
    users = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        User.status == UserStatus.active,
    ).order_by(User.name).all()
    return [{"id": u.id, "name": u.name, "email": u.email} for u in users]


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
    # Users can view themselves; admins can view anyone in org. Without this
    # check, any user could enumerate the whole org directory + role list.
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    if user_id != current_user.id and RoleName.admin not in role_names:
        raise HTTPException(status_code=403, detail="Access denied")

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


@router.post("/{user_id}/reset-password", response_model=AdminPasswordResetResponse)
def admin_reset_password(
    user_id: str,
    payload: AdminPasswordResetRequest,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin-initiated password reset. Always returns the generated temp
    password in the response so the admin can copy/share it manually,
    regardless of whether the email send succeeds."""
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_code = generate_temp_password()
    user.password_hash = hash_password(temp_code)
    user.temp_password = temp_code
    user.must_reset_password = True
    user.password_changed_at = datetime.utcnow()
    db.commit()

    email_sent = False
    if payload.send_email:
        email_sent = send_password_reset_code_email(user.email, user.name, temp_code)

    audit_service.log_event(
        db, current_user.organization_id, "PASSWORD_RESET_BY_ADMIN",
        user_id=current_user.id, entity_type="User", entity_id=user.id
    )
    return AdminPasswordResetResponse(temp_password=temp_code, email_sent=email_sent)


@router.patch("/{user_id}/mfa-required")
def set_mfa_required(
    user_id: str,
    payload: MFARequiredUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.mfa_required = payload.mfa_required
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "MFA_REQUIRED_CHANGED",
        user_id=current_user.id, entity_type="User", entity_id=user.id,
        details={"mfa_required": payload.mfa_required, "target_email": user.email}
    )
    return {"id": user.id, "mfa_required": user.mfa_required, "mfa_enabled": user.mfa_enabled}


@router.post("/{user_id}/mfa-reset")
def reset_user_mfa(
    user_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Clears a user's enrollment (secret + enabled flag) so they re-enroll
    with a fresh QR at their next MFA-required login. Does not touch
    mfa_required. For lost/replaced-phone recovery."""
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot reset your own MFA. Ask another admin.")

    user.mfa_secret = None
    user.mfa_enabled = False
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "MFA_RESET",
        user_id=current_user.id, entity_type="User", entity_id=user.id,
        details={"target_email": user.email}
    )
    return {"message": "MFA reset. The user will be prompted to re-enroll at next login."}


@router.post("/mfa/apply-all")
def apply_mfa_to_all(
    payload: MFABulkApplyRequest,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    count = db.query(User).filter(
        User.organization_id == current_user.organization_id
    ).update({"mfa_required": payload.mfa_required}, synchronize_session=False)
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "MFA_REQUIRED_BULK_APPLIED",
        user_id=current_user.id, entity_type="Organization", entity_id=current_user.organization_id,
        details={"mfa_required": payload.mfa_required, "affected_count": count}
    )
    return {"message": f"MFA requirement updated for {count} user(s).", "affected_count": count}
