from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from database import get_db
from models.user import User, UserStatus
from models.organization import Organization
from schemas.auth import (
    LoginRequest, TokenResponse, ForgotPasswordRequest,
    ForcePasswordResetRequest,
    MFASetupResponse, MFAVerifyRequest
)
from core.security import (
    create_access_token, create_refresh_token, get_current_active_user,
    create_mfa_pending_token, get_mfa_pending_user
)
from core.ratelimit import limiter
from services.auth_service import (
    verify_password, hash_password, generate_temp_password,
    generate_mfa_secret, get_totp_uri, generate_qr_code_base64, verify_totp,
    validate_password_strength
)
from services.email_service import send_password_reset_code_email
from services import audit_service
from config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _complete_login(db: Session, user: User, org_id: str) -> str:
    """Shared tail for every path that finishes a login (plain, or after MFA
    enrollment/verification): activate a pending user, stamp last_login,
    audit USER_LOGIN, and issue a real access token. A login that never
    completes MFA never reaches here, so it's never logged as successful."""
    if user.status == UserStatus.pending:
        user.status = UserStatus.active
    user.last_login = datetime.utcnow()
    db.commit()
    audit_service.log_event(
        db, org_id, "USER_LOGIN", user_id=user.id,
        entity_type="User", entity_id=user.id
    )
    return create_access_token({"sub": user.id, "org_id": org_id})


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    email_lower = payload.email.lower()

    # Auto-detect organisation from email domain (e.g. william@bsc.rw → email_domain='bsc.rw')
    email_domain = email_lower.split('@')[-1]
    org = db.query(Organization).filter(
        Organization.email_domain == email_domain,
        Organization.is_active == True
    ).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Lookup user
    user = db.query(User).filter(
        User.email == email_lower,
        User.organization_id == org.id
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    if user.status == UserStatus.not_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # MFA check: gated on the admin-set intent flag OR the org-wide policy
    # toggle, not on whether a secret already exists — see
    # models.user.User.mfa_required docstring. A positive org.mfa_reauth_days
    # skips the challenge if this user verified a code within that window.
    mfa_required = user.mfa_required or org.require_mfa_for_all
    if mfa_required and org.mfa_reauth_days and user.mfa_verified_at:
        if (datetime.utcnow() - user.mfa_verified_at).days < org.mfa_reauth_days:
            mfa_required = False

    if mfa_required:
        pending_token = create_mfa_pending_token({"sub": user.id, "org_id": org.id})
        return TokenResponse(
            access_token="",
            must_reset_password=False,
            mfa_required=True,
            mfa_pending_token=pending_token,
            mfa_enrolled=bool(user.mfa_enabled and user.mfa_secret),
        )

    access_token = _complete_login(db, user, org.id)
    return TokenResponse(
        access_token=access_token,
        must_reset_password=user.must_reset_password
    )


@router.post("/mfa/setup", response_model=MFASetupResponse)
@limiter.limit("10/minute")
def setup_mfa(
    request: Request,
    current_user: User = Depends(get_mfa_pending_user),
    db: Session = Depends(get_db)
):
    """Called during login (with the mfa_pending token) when a user with
    mfa_required=true hasn't finished enrollment yet."""
    if current_user.mfa_enabled and current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA is already set up for this account. Enter your code instead.")

    # Reuse an in-progress, unconfirmed secret across refreshes so re-scanning
    # doesn't invalidate a QR the user already has open.
    if not current_user.mfa_secret:
        current_user.mfa_secret = generate_mfa_secret()
        db.commit()

    uri = get_totp_uri(current_user.mfa_secret, current_user.email)
    qr_base64 = generate_qr_code_base64(uri)
    return MFASetupResponse(qr_code_url=f"data:image/png;base64,{qr_base64}", secret=current_user.mfa_secret)


@router.post("/mfa/enable", response_model=TokenResponse)
@limiter.limit("5/minute")
def enable_mfa(
    request: Request,
    payload: MFAVerifyRequest,
    current_user: User = Depends(get_mfa_pending_user),
    db: Session = Depends(get_db)
):
    """Confirms first-time enrollment AND completes the login that triggered
    it, in one call."""
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Call /auth/mfa/setup first.")
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled. Use /auth/mfa/verify instead.")
    if not verify_totp(current_user.mfa_secret, payload.totp_code):
        # 400, not 401: this is a wrong-guess on an otherwise-valid pending
        # session, not an invalid/expired session — a 401 here would trip the
        # frontend's global interceptor (which force-redirects to /login on
        # any 401, treating it as a dead session) and wipe the in-progress
        # MFA state instead of showing an inline error.
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    current_user.mfa_enabled = True
    current_user.mfa_verified_at = datetime.utcnow()
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "MFA_ENABLED",
        user_id=current_user.id, entity_type="User", entity_id=current_user.id
    )
    access_token = _complete_login(db, current_user, current_user.organization_id)
    return TokenResponse(access_token=access_token, must_reset_password=current_user.must_reset_password)


@router.post("/mfa/verify", response_model=TokenResponse)
@limiter.limit("5/minute")
def verify_mfa(
    request: Request,
    payload: MFAVerifyRequest,
    current_user: User = Depends(get_mfa_pending_user),
    db: Session = Depends(get_db)
):
    """Completes login for a user who is already enrolled."""
    if not (current_user.mfa_enabled and current_user.mfa_secret):
        raise HTTPException(status_code=400, detail="MFA is not set up for this account yet.")
    # Wrong, expired, and replayed codes all return the same generic message,
    # so a caller can never learn *why* verification failed. 400, not 401 —
    # see the matching comment in enable_mfa: a 401 here would trip the
    # frontend's global interceptor and force a full session-expired redirect.
    if not verify_totp(current_user.mfa_secret, payload.totp_code):
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    current_user.mfa_verified_at = datetime.utcnow()
    db.commit()

    access_token = _complete_login(db, current_user, current_user.organization_id)
    return TokenResponse(access_token=access_token, must_reset_password=current_user.must_reset_password)


@router.post("/force-reset-password")
@limiter.limit("10/minute")
def force_reset_password(
    request: Request,
    payload: ForcePasswordResetRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Forced password reset on first login."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    is_valid, error_msg = validate_password_strength(payload.new_password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_reset_password = False
    current_user.temp_password = None
    current_user.password_changed_at = datetime.utcnow()
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "PASSWORD_CHANGED",
        user_id=current_user.id, entity_type="User", entity_id=current_user.id
    )
    # Changing the password invalidates the token the client is currently
    # using (see core.security.get_current_user), so hand back a fresh one to
    # keep the session alive without forcing a re-login.
    new_token = create_access_token(
        {"sub": current_user.id, "org_id": current_user.organization_id}
    )
    return {"message": "Password updated successfully", "access_token": new_token}


@router.post("/forgot-password")
@limiter.limit("5/minute")
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    generic = {"message": "If that email is registered, a temporary password will be sent."}

    email_lower = payload.email.lower()
    email_domain = email_lower.split('@')[-1]
    org = db.query(Organization).filter(
        Organization.email_domain == email_domain,
        Organization.is_active == True
    ).first()
    if not org:
        return generic

    user = db.query(User).filter(
        User.email == email_lower,
        User.organization_id == org.id
    ).first()
    if not user:
        return generic

    temp_code = generate_temp_password()

    # Email-first: only overwrite the account's password once the send has
    # actually succeeded, so an SMTP outage can never invalidate a still-
    # working password. Same generic response either way (anti-enumeration).
    if not send_password_reset_code_email(user.email, user.name, temp_code):
        return generic

    user.password_hash = hash_password(temp_code)
    user.temp_password = temp_code
    user.must_reset_password = True
    user.password_changed_at = datetime.utcnow()
    db.commit()

    audit_service.log_event(
        db, org.id, "PASSWORD_RESET_REQUESTED",
        user_id=user.id, entity_type="User", entity_id=user.id
    )
    return generic


@router.get("/me")
def get_me(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    roles = [ur.role.name for ur in current_user.user_roles if ur.role]
    role_categories = list({ur.role.role_category.value for ur in current_user.user_roles if ur.role})

    # Resolve department / unit names.
    # Convention: if the user's department has a parent, the parent is the "department"
    # and the user's department is the "unit". Otherwise the department IS the department.
    dept = current_user.department
    dept_name = None
    unit_name = None
    if dept:
        if dept.parent_department_id:
            unit_name = dept.name
            parent = db.get(dept.__class__, dept.parent_department_id)
            dept_name = parent.name if parent else dept.name
        else:
            dept_name = dept.name

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "organization_id": current_user.organization_id,
        "status": current_user.status,
        "roles": roles,
        "role_categories": role_categories,
        "must_reset_password": current_user.must_reset_password,
        "mfa_enabled": current_user.mfa_enabled,
        # Enriched profile for form data-binding
        "department_name": dept_name,
        "unit_name": unit_name,
        "manager_id": current_user.manager_id,
        "manager_name": current_user.manager.name if current_user.manager else None,
        "sn_manager_name": current_user.sn_manager.name if current_user.sn_manager else None,
        "hod_name": current_user.hod.name if current_user.hod else None,
    }
