from pydantic import BaseModel, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_reset_password: bool = False
    mfa_required: bool = False
    # Short-lived token returned when mfa_required is True; the client exchanges
    # it plus a TOTP code at /auth/mfa/verify for a real session.
    mfa_token: Optional[str] = None


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str


class ForcePasswordResetRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class MFASetupResponse(BaseModel):
    qr_code_url: str
    secret: str


class MFAVerifyRequest(BaseModel):
    totp_code: str


class MFALoginRequest(BaseModel):
    """Sent to /auth/mfa/verify to complete an MFA-gated login."""
    mfa_token: str
    totp_code: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str
