import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Boolean, DateTime, Integer, Text, ForeignKey,
    Enum as SAEnum, JSON, Float
)
from sqlalchemy.orm import relationship
from database import Base
import enum


def gen_uuid():
    return str(uuid.uuid4())


class FormVisibility(str, enum.Enum):
    all_users = "all_users"
    specific_departments = "specific_departments"


class FormStatus(str, enum.Enum):
    draft = "Draft"
    submitted = "Submitted"
    pending = "Pending"
    returned_for_correction = "Returned for Correction"
    rejected = "Rejected"
    approved = "Approved"
    completed = "Completed"


class VersionStatus(str, enum.Enum):
    draft = "Draft"
    active = "Active"
    superseded = "Superseded"


class FieldType(str, enum.Enum):
    text = "text"
    number = "number"
    date = "date"
    dropdown = "dropdown"
    checkbox = "checkbox"
    textarea = "textarea"
    calculated = "calculated"
    file = "file"
    signature = "signature"
    radio = "radio"
    currency = "currency"
    table = "table"


class FormDefinition(Base):
    __tablename__ = "form_definitions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    code_suffix = Column(String(20), nullable=False)          # used in reference number e.g. "LRQ"
    visibility = Column(SAEnum(FormVisibility), default=FormVisibility.all_users)
    visible_department_ids = Column(JSON, nullable=True)      # list of dept IDs if specific
    allow_backdating = Column(Boolean, default=False)
    allow_attachments = Column(Boolean, default=True)
    approval_template_id = Column(String(36), ForeignKey("approval_templates.id"), nullable=True)
    pdf_template_path = Column(String(500), nullable=True)    # path to uploaded PDF background
    is_active = Column(Boolean, default=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="form_definitions")
    fields = relationship("FormField", back_populates="form_definition", order_by="FormField.display_order")
    instances = relationship("FormInstance", back_populates="form_definition")
    approval_template = relationship("ApprovalTemplate", foreign_keys=[approval_template_id])
    creator = relationship("User", foreign_keys=[created_by])


class FormField(Base):
    __tablename__ = "form_fields"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    form_definition_id = Column(String(36), ForeignKey("form_definitions.id"), nullable=False)
    field_name = Column(String(100), nullable=False)          # internal key
    field_label = Column(String(255), nullable=False)         # display label
    field_type = Column(SAEnum(FieldType), nullable=False)
    required = Column(Boolean, default=True)
    auto_filled = Column(Boolean, default=False)              # e.g. date, user name auto-filled
    auto_fill_source = Column(String(100), nullable=True)     # e.g. "current_user.name"
    calculation_enabled = Column(Boolean, default=False)
    calculation_formula = Column(Text, nullable=True)         # expression string
    options = Column(JSON, nullable=True)                     # for dropdowns/checkboxes
    placeholder = Column(String(255), nullable=True)
    display_order = Column(Integer, default=0)
    # Enhanced field properties
    default_value = Column(Text, nullable=True)
    read_only = Column(Boolean, default=False)
    validation_rules = Column(JSON, nullable=True)   # {min, max, pattern, min_length, max_length}
    calculation_formula = Column(Text, nullable=True) # e.g. "qty * unit_price"
    table_columns = Column(JSON, nullable=True)      # [{key, label, type, formula}]
    # PDF layout coordinates (percentages 0-100, relative to page size)
    page_number = Column(Integer, default=1, nullable=True)
    x_pct = Column(Float, nullable=True)
    y_pct = Column(Float, nullable=True)
    width_pct = Column(Float, nullable=True)
    height_pct = Column(Float, nullable=True)
    # Field responsibility: who fills this field
    filled_by = Column(String(20), default='initiator', nullable=True)  # initiator|line_manager|sn_manager|hod|any
    is_active = Column(Boolean, default=True)

    # Relationships
    form_definition = relationship("FormDefinition", back_populates="fields")
    field_values = relationship("FormFieldValue", back_populates="form_field")


class FormInstance(Base):
    __tablename__ = "form_instances"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    form_definition_id = Column(String(36), ForeignKey("form_definitions.id"), nullable=False)
    reference_number = Column(String(50), unique=True, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    current_status = Column(SAEnum(FormStatus), default=FormStatus.draft)
    current_version = Column(Integer, default=1)
    backdated_date = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    form_definition = relationship("FormDefinition", back_populates="instances")
    creator = relationship("User", foreign_keys=[created_by])
    versions = relationship("FormVersion", back_populates="form_instance", order_by="FormVersion.version_number")
    attachments = relationship("FormAttachment", back_populates="form_instance")
    generated_documents = relationship("GeneratedDocument", back_populates="form_instance")


class FormVersion(Base):
    __tablename__ = "form_versions"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    form_instance_id = Column(String(36), ForeignKey("form_instances.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    change_notes = Column(Text, nullable=True)
    status = Column(SAEnum(VersionStatus), default=VersionStatus.draft)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    form_instance = relationship("FormInstance", back_populates="versions")
    creator = relationship("User", foreign_keys=[created_by])
    field_values = relationship("FormFieldValue", back_populates="form_version")
    approval_instances = relationship("ApprovalInstance", back_populates="form_version")


class FormFieldValue(Base):
    __tablename__ = "form_field_values"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    form_version_id = Column(String(36), ForeignKey("form_versions.id"), nullable=False)
    form_field_id = Column(String(36), ForeignKey("form_fields.id"), nullable=False)
    value = Column(Text, nullable=True)

    # Relationships
    form_version = relationship("FormVersion", back_populates="field_values")
    form_field = relationship("FormField", back_populates="field_values")


class FormAttachment(Base):
    __tablename__ = "form_attachments"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    form_instance_id = Column(String(36), ForeignKey("form_instances.id"), nullable=False)
    original_filename = Column(String(500), nullable=False)
    stored_filename = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=True)
    content_type = Column(String(100), nullable=True)
    uploaded_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_after_submission = Column(Boolean, default=False)   # True = added post-submit

    # Relationships
    form_instance = relationship("FormInstance", back_populates="attachments")
    uploader = relationship("User", foreign_keys=[uploaded_by])
