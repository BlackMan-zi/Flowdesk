from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from models.user import UserStatus, RoleCategory


class RoleCreate(BaseModel):
    name: str
    role_category: RoleCategory
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


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    department_id: Optional[str] = None
    manager_id: Optional[str] = None
    sn_manager_id: Optional[str] = None
    hod_id: Optional[str] = None
    role_ids: Optional[List[str]] = None
    status: Optional[UserStatus] = None
    mfa_enabled: Optional[bool] = None


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
