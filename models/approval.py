import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, Text, ForeignKey,
    Enum as SAEnum
)
from sqlalchemy.orm import relationship
from database import Base
import enum


def gen_uuid():
    return str(uuid.uuid4())


class RoleType(str, enum.Enum):
    hierarchy = "Hierarchy"          # Manager, SN Manager, HOD
    functional = "Functional"        # HR, HR & Admin
    executive = "Executive"          # CFO, CEO, Chief Corporate
    specific_user = "SpecificUser"   # Fixed user defined in template
    selected_at_submission = "SelectedAtSubmission"  # Initiator picks at submit


class ApprovalStepStatus(str, enum.Enum):
    waiting = "Waiting"
    active = "Active"
    approved = "Approved"
    rejected = "Rejected"
    sent_back = "Sent Back"
    skipped = "Skipped"


class ApprovalTemplate(Base):
    __tablename__ = "approval_templates"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    restart_on_correction = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="approval_templates")
    steps = relationship(
        "ApprovalTemplateStep",
        back_populates="template",
        order_by="ApprovalTemplateStep.step_order"
    )
    cc_recipients = relationship(
        "ApprovalTemplateCCRecipient",
        back_populates="template",
        cascade="all, delete-orphan"
    )
    creator = relationship("User", foreign_keys=[created_by])


class ApprovalTemplateStep(Base):
    __tablename__ = "approval_template_steps"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    template_id = Column(String(36), ForeignKey("approval_templates.id"), nullable=False)
    step_order = Column(Integer, nullable=False)
    step_label = Column(String(200), nullable=True)               # e.g. "Line Manager Approval"
    role_type = Column(SAEnum(RoleType), nullable=False)

    # For Functional/Executive role types – which system role?
    role_id = Column(String(36), ForeignKey("roles.id"), nullable=True)

    # For SpecificUser role type
    specific_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)

    # For Hierarchy role type (which hierarchy level)
    hierarchy_level = Column(String(50), nullable=True)  # "manager", "sn_manager", "hod"

    skip_if_missing = Column(Boolean, default=False)
    delegation_allowed = Column(Boolean, default=True)

    # Relationships
    template = relationship("ApprovalTemplate", back_populates="steps")
    role = relationship("Role", foreign_keys=[role_id])
    specific_user = relationship("User", foreign_keys=[specific_user_id])


class ApprovalTemplateCCRecipient(Base):
    """People/positions who receive a copy of the completed document."""
    __tablename__ = "approval_template_cc_recipients"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    template_id = Column(String(36), ForeignKey("approval_templates.id"), nullable=False)
    role_type = Column(SAEnum(RoleType), nullable=False)
    role_id = Column(String(36), ForeignKey("roles.id"), nullable=True)
    specific_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    hierarchy_level = Column(String(50), nullable=True)  # "manager", "sn_manager", "hod"
    label = Column(String(200), nullable=True)  # display label

    # Relationships
    template = relationship("ApprovalTemplate", back_populates="cc_recipients")
    role = relationship("Role", foreign_keys=[role_id])
    specific_user = relationship("User", foreign_keys=[specific_user_id])


class ApprovalInstance(Base):
    __tablename__ = "approval_instances"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    form_version_id = Column(String(36), ForeignKey("form_versions.id"), nullable=False)
    template_step_id = Column(String(36), ForeignKey("approval_template_steps.id"), nullable=True)
    step_order = Column(Integer, nullable=False)
    step_label = Column(String(200), nullable=True)
    approver_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    delegated_from_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    status = Column(SAEnum(ApprovalStepStatus), default=ApprovalStepStatus.waiting)
    notes = Column(Text, nullable=True)                            # rejection / correction notes
    signed_at = Column(DateTime, nullable=True)
    signature_id = Column(String(36), ForeignKey("signatures.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    form_version = relationship("FormVersion", back_populates="approval_instances")
    template_step = relationship("ApprovalTemplateStep")
    approver = relationship("User", foreign_keys=[approver_user_id])
    delegated_from = relationship("User", foreign_keys=[delegated_from_user_id])
    signature = relationship("Signature", foreign_keys=[signature_id])
