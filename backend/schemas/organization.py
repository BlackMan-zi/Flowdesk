from pydantic import BaseModel, field_validator
from typing import Optional, List, Union
from datetime import datetime


class ClassificationLabel(BaseModel):
    name: str
    color: Optional[str] = None   # hex like "#EF4444"


def _normalize_labels(value) -> Optional[List[dict]]:
    """Accept either list[str] (legacy) or list[{name,color}] and normalize to dicts."""
    if value is None:
        return None
    out: List[dict] = []
    for item in value:
        if isinstance(item, str):
            out.append({"name": item, "color": None})
        elif isinstance(item, dict) and item.get("name"):
            out.append({"name": item["name"], "color": item.get("color")})
    return out


class OrganizationCreate(BaseModel):
    name: str
    # subscription_plan is intentionally NOT accepted from the client: it is
    # set server-side so a caller can't self-provision on a higher tier.


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    # subscription_plan is intentionally NOT tenant-editable (billing concern).
    is_active: Optional[bool] = None
    letterhead_accent: Optional[str] = None
    classification_labels: Optional[List[Union[ClassificationLabel, str]]] = None
    require_mfa_for_all: Optional[bool] = None
    mfa_reauth_days: Optional[int] = None

    @field_validator("classification_labels", mode="before")
    @classmethod
    def _normalize(cls, v):
        return _normalize_labels(v)


class OrganizationResponse(BaseModel):
    id: str
    name: str
    subscription_plan: str
    is_active: bool
    created_at: datetime
    # Branding: paths are server-side; the frontend uses dedicated URLs to fetch the images.
    has_header_image: bool = False
    has_footer_image: bool = False
    letterhead_accent: Optional[str] = None
    classification_labels: Optional[List[ClassificationLabel]] = None
    require_mfa_for_all: bool = False
    mfa_reauth_days: Optional[int] = None

    class Config:
        from_attributes = True

    @field_validator("has_header_image", "has_footer_image", mode="before")
    @classmethod
    def _coerce_bool(cls, v):
        return bool(v)

    @field_validator("classification_labels", mode="before")
    @classmethod
    def _normalize_for_response(cls, v):
        return _normalize_labels(v)


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
