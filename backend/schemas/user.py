from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models.user import UserStatus, RoleCategory


class RoleCreate(BaseModel):
    name: str
    role_category: RoleCategory
    description: Optional[str] = None


class RoleUpdate(BaseModel):
    name: str
    description: Optional[str] = None


class RoleResponse(BaseModel):
    id: str
    name: str
    role_category: RoleCategory
    description: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    department_id: Optional[str] = None
    manager_id: Optional[str] = None
    sn_manager_id: Optional[str] = None
    hod_id: Optional[str] = None
    role_ids: List[str] = []
    send_welcome_email: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    department_id: Optional[str] = None
    manager_id: Optional[str] = None
    sn_manager_id: Optional[str] = None
    hod_id: Optional[str] = None
    role_ids: Optional[List[str]] = None
    status: Optional[UserStatus] = None
    # mfa_enabled/mfa_required are intentionally NOT settable here — MFA state
    # only changes through the dedicated /users/{id}/mfa-required and
    # /users/{id}/mfa-reset endpoints, which apply the right invariants
    # (audit logging, self-reset guard) that a generic field-setter can't.


class UserResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    email: str
    department_id: Optional[str]
    manager_id: Optional[str]
    sn_manager_id: Optional[str]
    hod_id: Optional[str]
    status: UserStatus
    mfa_required: bool
    mfa_enabled: bool
    must_reset_password: bool
    created_at: datetime
    roles: List[RoleResponse] = []

    class Config:
        from_attributes = True


class UserSummary(BaseModel):
    """Lightweight user representation for nested responses."""
    id: str
    name: str
    email: str
    status: UserStatus

    class Config:
        from_attributes = True


class AdminPasswordResetRequest(BaseModel):
    send_email: bool = True


class AdminPasswordResetResponse(BaseModel):
    temp_password: str
    email_sent: bool


class MFARequiredUpdate(BaseModel):
    mfa_required: bool
