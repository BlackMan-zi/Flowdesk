from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


class OrganizationCreate(BaseModel):
    name: str
    subdomain: str
    subscription_plan: str = "starter"


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    subscription_plan: Optional[str] = None
    is_active: Optional[bool] = None
    letterhead_accent: Optional[str] = None
    classification_labels: Optional[List[str]] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    subdomain: str
    subscription_plan: str
    is_active: bool
    created_at: datetime
    # Branding — paths are server-side; the frontend uses dedicated URLs to fetch the images.
    has_header_image: bool = False
    has_footer_image: bool = False
    letterhead_accent: Optional[str] = None
    classification_labels: Optional[List[str]] = None

    class Config:
        from_attributes = True

    @field_validator("has_header_image", "has_footer_image", mode="before")
    @classmethod
    def _coerce_bool(cls, v):
        return bool(v)


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
