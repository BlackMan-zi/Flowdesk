import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base
import enum


def gen_uuid():
    return str(uuid.uuid4())


class SignatureType(str, enum.Enum):
    canvas = "canvas"           # drawn on canvas in browser
    risa_upload = "risa_upload" # uploaded RISA digital signature file


class Signature(Base):
    __tablename__ = "signatures"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    approval_instance_id = Column(String(36), ForeignKey("approval_instances.id"), nullable=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    signature_type = Column(SAEnum(SignatureType), nullable=False)
    signature_data = Column(Text, nullable=True)      # base64 for canvas
    file_path = Column(String(500), nullable=True)    # path for RISA upload
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", foreign_keys=[user_id])


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    form_instance_id = Column(String(36), ForeignKey("form_instances.id"), nullable=False)
    form_version_id = Column(String(36), ForeignKey("form_versions.id"), nullable=False)
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    file_size = Column(Integer, nullable=True)
    is_final = Column(Boolean, default=False)
    generated_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    form_instance = relationship("FormInstance", back_populates="generated_documents")
    form_version = relationship("FormVersion")
    generated_by_user = relationship("User", foreign_keys=[generated_by])
    shares = relationship("DocumentShare", back_populates="document", cascade="all, delete-orphan")


class DocumentShare(Base):
    """Per-user access record for a completed document (initiator, approver, or CC)."""
    __tablename__ = "document_shares"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    document_id = Column(String(36), ForeignKey("generated_documents.id"), nullable=False)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    share_reason = Column(String(50), nullable=False)  # "initiator", "approver", "cc"
    shared_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("GeneratedDocument", back_populates="shares")
    user = relationship("User", foreign_keys=[user_id])
