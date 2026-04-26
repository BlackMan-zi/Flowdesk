from pydantic import BaseModel, field_validator
from typing import Optional, List, Any, Dict
from datetime import datetime
from models.form import FormStatus, VersionStatus, FieldType, FormVisibility


class FormFieldCreate(BaseModel):
    id: Optional[str] = None          # provided when updating an existing field
    field_name: str
    field_label: str
    field_type: FieldType
    required: bool = True
    auto_filled: bool = False
    auto_fill_source: Optional[str] = None
    calculation_enabled: bool = False
    calculation_formula: Optional[str] = None
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None
    display_order: int = 0
    # Enhanced properties
    default_value: Optional[str] = None
    read_only: bool = False
    validation_rules: Optional[Dict[str, Any]] = None
    table_columns: Optional[List[Dict[str, Any]]] = None
    # PDF layout coordinates
    page_number: Optional[int] = 1
    x_pct: Optional[float] = None
    y_pct: Optional[float] = None
    width_pct: Optional[float] = None
    height_pct: Optional[float] = None
    filled_by: Optional[str] = 'initiator'


class FormFieldResponse(BaseModel):
    id: str
    field_name: str
    field_label: str
    field_type: FieldType
    required: bool
    auto_filled: bool
    auto_fill_source: Optional[str]
    calculation_enabled: bool
    calculation_formula: Optional[str] = None
    options: Optional[List[str]]
    placeholder: Optional[str]
    display_order: int
    default_value: Optional[str] = None
    read_only: bool = False
    validation_rules: Optional[Dict[str, Any]] = None
    table_columns: Optional[List[Dict[str, Any]]] = None
    page_number: Optional[int] = 1
    x_pct: Optional[float] = None
    y_pct: Optional[float] = None
    width_pct: Optional[float] = None
    height_pct: Optional[float] = None
    filled_by: Optional[str] = 'initiator'

    class Config:
        from_attributes = True


class FormDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    code_suffix: str
    visibility: FormVisibility = FormVisibility.all_users
    visible_department_ids: Optional[List[str]] = None
    allow_backdating: bool = False
    allow_attachments: bool = True
    approval_template_id: Optional[str] = None
    fields: List[FormFieldCreate] = []


class FormDefinitionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    code_suffix: Optional[str] = None
    visibility: Optional[FormVisibility] = None
    visible_department_ids: Optional[List[str]] = None
    allow_backdating: Optional[bool] = None
    allow_attachments: Optional[bool] = None
    approval_template_id: Optional[str] = None
    is_active: Optional[bool] = None


class ApprovalTemplateStepBrief(BaseModel):
    id: str
    step_order: int
    step_label: Optional[str] = None
    role_type: str          # 'Hierarchy' | 'Functional' | 'Executive' | 'SpecificUser'
    role_id: Optional[str] = None
    specific_user_id: Optional[str] = None
    hierarchy_level: Optional[str] = None  # 'manager' | 'sn_manager' | 'hod'
    skip_if_missing: bool = False

    class Config:
        from_attributes = True


class ApprovalTemplateBrief(BaseModel):
    id: str
    name: str
    steps: List[ApprovalTemplateStepBrief] = []

    class Config:
        from_attributes = True


class FormDefinitionResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    code_suffix: str
    visibility: FormVisibility
    visible_department_ids: Optional[List[str]] = None
    allow_backdating: bool
    allow_attachments: bool
    approval_template_id: Optional[str]
    approval_template: Optional[ApprovalTemplateBrief] = None
    pdf_template_path: Optional[str] = None
    is_active: bool
    fields: List[FormFieldResponse] = []

    @field_validator('fields', mode='before')
    @classmethod
    def only_active_fields(cls, v):
        return [f for f in (v or []) if getattr(f, 'is_active', None) is not False]

    class Config:
        from_attributes = True


class FieldValueInput(BaseModel):
    form_field_id: str
    value: Optional[str] = None


class FormInstanceCreate(BaseModel):
    form_definition_id: str
    backdated_date: Optional[datetime] = None
    field_values: List[FieldValueInput] = []


class FormInstanceSubmit(BaseModel):
    field_values: List[FieldValueInput]
    change_notes: Optional[str] = None
    selected_approver_ids: Optional[Dict[str, str]] = None  # step_id -> user_id


class FormVersionResponse(BaseModel):
    id: str
    version_number: int
    created_by: str
    change_notes: Optional[str]
    status: VersionStatus
    created_at: datetime
    field_values: List[Dict[str, Any]] = []

    class Config:
        from_attributes = True


class FormInstanceResponse(BaseModel):
    id: str
    organization_id: str
    form_definition_id: str
    reference_number: str
    created_by: str
    current_status: FormStatus
    current_version: int
    backdated_date: Optional[datetime]
    submitted_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime
    # lightweight extras populated by the list endpoint
    form_name: Optional[str] = None
    approval_progress: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class FormInstanceDetail(FormInstanceResponse):
    form_definition: Optional[FormDefinitionResponse] = None
    versions: List[FormVersionResponse] = []


class DraftUpdateInput(BaseModel):
    field_values: List[FieldValueInput]
