from pydantic import BaseModel, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    # Organisation is auto-detected from the email domain (e.g. @bsc.rw → BSC Rwanda)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_reset_password: bool = False
    mfa_required: bool = False


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str


class ForcePasswordResetRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # Organisation auto-detected from email domain


class MFASetupResponse(BaseModel):
    qr_code_url: str
    secret: str


class MFAVerifyRequest(BaseModel):
    totp_code: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str
