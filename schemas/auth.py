from pydantic import BaseModel, EmailStr, Field
from typing import Optional

# Bound password length: 8 is the floor (full complexity is checked server-side
# by validate_password_strength); 128 caps input so an enormous string can't be
# fed into bcrypt as a CPU-exhaustion vector.
NewPassword = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_reset_password: bool = False
    mfa_required: bool = False
    # Short-lived token returned when mfa_required is True; the client exchanges
    # it plus a TOTP code at /auth/mfa/verify for a real session.
    mfa_token: Optional[str] = None


class PasswordResetRequest(BaseModel):
    token: str = Field(max_length=512)
    new_password: str = NewPassword


class ForcePasswordResetRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = NewPassword


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class MFASetupResponse(BaseModel):
    qr_code_url: str
    secret: str


class MFAVerifyRequest(BaseModel):
    totp_code: str = Field(pattern=r"^\d{6}$")


class MFALoginRequest(BaseModel):
    """Sent to /auth/mfa/verify to complete an MFA-gated login."""
    mfa_token: str = Field(max_length=1024)
    totp_code: str = Field(pattern=r"^\d{6}$")


class RefreshTokenRequest(BaseModel):
    refresh_token: str
