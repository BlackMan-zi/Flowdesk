from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from database import get_db
from models.user import User, UserStatus, PasswordResetToken
from models.organization import Organization
from schemas.auth import (
    LoginRequest, TokenResponse, ForgotPasswordRequest,
    ForcePasswordResetRequest, PasswordResetRequest,
    MFASetupResponse, MFAVerifyRequest
)
from core.security import (
    create_access_token, create_refresh_token, get_current_active_user
)
from services.auth_service import (
    verify_password, hash_password, generate_reset_token,
    generate_mfa_secret, get_totp_uri, generate_qr_code_base64, verify_totp
)
from services.email_service import send_password_reset_email
from services import audit_service
from config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    # Lookup org
    org = db.query(Organization).filter(
        Organization.subdomain == payload.org_subdomain,
        Organization.is_active == True
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Lookup user
    user = db.query(User).filter(
        User.email == payload.email.lower(),
        User.organization_id == org.id
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    if user.status == UserStatus.not_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    # MFA check
    if user.mfa_enabled and user.mfa_secret:
        return TokenResponse(
            access_token="",
            must_reset_password=False,
            mfa_required=True
        )

    token_data = {"sub": user.id, "org_id": org.id}
    access_token = create_access_token(token_data)

    # First login – activate user
    if user.status == UserStatus.pending:
        user.status = UserStatus.active

    user.last_login = datetime.utcnow()
    db.commit()

    audit_service.log_event(
        db, org.id, "USER_LOGIN", user_id=user.id,
        entity_type="User", entity_id=user.id
    )

    return TokenResponse(
        access_token=access_token,
        must_reset_password=user.must_reset_password
    )


@router.post("/mfa/verify")
def verify_mfa(payload: MFAVerifyRequest, db: Session = Depends(get_db)):
    """Verify TOTP code during login (called after /login returns mfa_required=True)."""
    raise HTTPException(
        status_code=400,
        detail="Please supply email/password alongside TOTP for full MFA verification"
    )


@router.post("/force-reset-password")
def force_reset_password(
    payload: ForcePasswordResetRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Forced password reset on first login."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.password_hash = hash_password(payload.new_password)
    current_user.must_reset_password = False
    current_user.temp_password = None
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "PASSWORD_CHANGED",
        user_id=current_user.id, entity_type="User", entity_id=current_user.id
    )
    return {"message": "Password updated successfully"}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    org = db.query(Organization).filter(
        Organization.subdomain == payload.org_subdomain
    ).first()
    if not org:
        return {"message": "If that email is registered, a reset link will be sent."}

    user = db.query(User).filter(
        User.email == payload.email.lower(),
        User.organization_id == org.id
    ).first()
    if not user:
        return {"message": "If that email is registered, a reset link will be sent."}

    token_str = generate_reset_token()
    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token_str,
        expires_at=datetime.utcnow() + timedelta(hours=1)
    )
    db.add(reset_token)
    db.commit()

    send_password_reset_email(user.email, user.name, token_str)
    return {"message": "If that email is registered, a reset link will be sent."}


@router.post("/reset-password")
def reset_password(payload: PasswordResetRequest, db: Session = Depends(get_db)):
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == payload.token,
        PasswordResetToken.used == False,
        PasswordResetToken.expires_at > datetime.utcnow()
    ).first()
    if not reset_token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(payload.new_password)
    user.must_reset_password = False
    reset_token.used = True
    db.commit()

    audit_service.log_event(
        db, user.organization_id, "PASSWORD_RESET",
        user_id=user.id, entity_type="User", entity_id=user.id
    )
    return {"message": "Password reset successfully"}


@router.post("/mfa/setup", response_model=MFASetupResponse)
def setup_mfa(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    secret = generate_mfa_secret()
    uri = get_totp_uri(secret, current_user.email)
    qr_base64 = generate_qr_code_base64(uri)

    current_user.mfa_secret = secret
    db.commit()

    return MFASetupResponse(qr_code_url=f"data:image/png;base64,{qr_base64}", secret=secret)


@router.post("/mfa/enable")
def enable_mfa(
    payload: MFAVerifyRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA not set up. Call /mfa/setup first.")
    if not verify_totp(current_user.mfa_secret, payload.totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    current_user.mfa_enabled = True
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "MFA_ENABLED",
        user_id=current_user.id, entity_type="User", entity_id=current_user.id
    )
    return {"message": "MFA enabled successfully"}


@router.get("/me")
def get_me(current_user: User = Depends(get_current_active_user), db: Session = Depends(get_db)):
    roles = [ur.role.name for ur in current_user.user_roles if ur.role]
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "organization_id": current_user.organization_id,
        "status": current_user.status,
        "roles": roles,
        "must_reset_password": current_user.must_reset_password,
        "mfa_enabled": current_user.mfa_enabled,
    }
