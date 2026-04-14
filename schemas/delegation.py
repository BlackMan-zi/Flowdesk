from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


class UserBrief(BaseModel):
    id: str
    name: str
    email: str

    class Config:
        from_attributes = True


class DelegationCreate(BaseModel):
    delegate_user_id: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


class DelegationAdminCreate(BaseModel):
    original_approver_id: str
    delegate_user_id: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


class DelegationResponse(BaseModel):
    id: str
    organization_id: str
    original_approver_id: str
    delegate_user_id: str
    start_date: date
    end_date: date
    reason: Optional[str]
    is_active: bool
    returned_at: Optional[datetime] = None
    created_at: datetime
    original_approver: Optional[UserBrief] = None
    delegate_user: Optional[UserBrief] = None

    class Config:
        from_attributes = True
