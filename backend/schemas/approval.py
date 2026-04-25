from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from models.approval import RoleType, ApprovalStepStatus


class ApprovalTemplateStepCreate(BaseModel):
    step_order: int
    step_label: Optional[str] = None
    role_type: RoleType
    role_id: Optional[str] = None
    specific_user_id: Optional[str] = None
    hierarchy_level: Optional[str] = None  # "manager", "sn_manager", "hod"
    skip_if_missing: bool = False
    delegation_allowed: bool = True


class ApprovalTemplateCCRecipientCreate(BaseModel):
    role_type: RoleType
    role_id: Optional[str] = None
    specific_user_id: Optional[str] = None
    hierarchy_level: Optional[str] = None
    label: Optional[str] = None


class ApprovalTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    restart_on_correction: bool = True
    steps: List[ApprovalTemplateStepCreate] = []
    cc_recipients: List[ApprovalTemplateCCRecipientCreate] = []


class ApprovalTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    restart_on_correction: Optional[bool] = None
    is_active: Optional[bool] = None
    steps: Optional[List[ApprovalTemplateStepCreate]] = None
    cc_recipients: Optional[List[ApprovalTemplateCCRecipientCreate]] = None


class ApprovalTemplateStepResponse(BaseModel):
    id: str
    step_order: int
    step_label: Optional[str]
    role_type: RoleType
    role_id: Optional[str]
    specific_user_id: Optional[str]
    hierarchy_level: Optional[str]
    skip_if_missing: bool
    delegation_allowed: bool

    class Config:
        from_attributes = True


class ApprovalTemplateCCRecipientResponse(BaseModel):
    id: str
    role_type: RoleType
    role_id: Optional[str]
    specific_user_id: Optional[str]
    hierarchy_level: Optional[str]
    label: Optional[str]

    class Config:
        from_attributes = True


class ApprovalTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    restart_on_correction: bool
    is_active: bool
    steps: List[ApprovalTemplateStepResponse] = []
    cc_recipients: List[ApprovalTemplateCCRecipientResponse] = []

    class Config:
        from_attributes = True


class ApprovalFieldValue(BaseModel):
    form_field_id: str
    value: Optional[str] = None

class ApprovalActionRequest(BaseModel):
    notes: Optional[str] = None
    signature_data: Optional[str] = None       # base64 canvas signature
    signature_type: Optional[str] = "canvas"
    field_values: Optional[List[ApprovalFieldValue]] = []


class ApprovalInstanceResponse(BaseModel):
    id: str
    form_version_id: str
    step_order: int
    step_label: Optional[str]
    approver_user_id: Optional[str]
    delegated_from_user_id: Optional[str]
    status: ApprovalStepStatus
    notes: Optional[str]
    signed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class SignatureUpload(BaseModel):
    approval_instance_id: str
    signature_type: str = "canvas"
    signature_data: Optional[str] = None   # base64
