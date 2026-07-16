from pydantic import BaseModel, EmailStr, Field
from typing import Optional

# Caps input length so an enormous string can't be fed into bcrypt as a
# CPU-exhaustion vector. Deliberately NOT setting min_length here: that would
# make FastAPI reject short passwords with a Pydantic-shaped 422 error (a
# list under "detail"), but the frontend renders `detail` as a plain string
# (see ForcePasswordReset.jsx and friends); the real minimum-length +
# complexity gate is services.auth_service.validate_password_strength, which
# raises the plain-string 400 the frontend already knows how to display.
NewPassword = Field(max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    # Organisation is auto-detected from the email domain (e.g. @bsc.rw → BSC Rwanda)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_reset_password: bool = False
    mfa_required: bool = False
    mfa_pending_token: Optional[str] = None
    mfa_enrolled: Optional[bool] = None


class ForcePasswordResetRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = NewPassword


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # Organisation auto-detected from email domain


class MFASetupResponse(BaseModel):
    qr_code_url: str
    secret: str


class MFAVerifyRequest(BaseModel):
    totp_code: str = Field(pattern=r"^\d{6}$")


class RefreshTokenRequest(BaseModel):
    refresh_token: str
