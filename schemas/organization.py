from pydantic import BaseModel, field_validator, Field
from typing import Optional
from datetime import datetime


class OrganizationCreate(BaseModel):
    name: str = Field(max_length=255)
    email_domain: Optional[str] = Field(default=None, max_length=255)
    # subscription_plan is intentionally NOT accepted from the client — it is set
    # server-side so a caller can't self-provision on a higher billing tier.


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=255)
    is_active: Optional[bool] = None
    # subscription_plan is intentionally NOT tenant-editable (billing concern).


class OrganizationResponse(BaseModel):
    id: str
    name: str
    email_domain: Optional[str] = None
    subscription_plan: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    name: str
    parent_department_id: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    parent_department_id: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    parent_department_id: Optional[str]
    is_active: bool
    member_count: Optional[int] = 0

    class Config:
        from_attributes = True
