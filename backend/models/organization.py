import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


# Defaults — colors chosen so common labels are intuitive at a glance.
DEFAULT_CLASSIFICATION_LABELS = [
    {"name": "Public",       "color": "#22C55E"},  # green
    {"name": "Internal",     "color": "#EAB308"},  # yellow
    {"name": "Confidential", "color": "#EF4444"},  # red
    {"name": "Restricted",   "color": "#64748B"},  # slate
]

# Map of well-known label names → suggested color, used when admins add a new
# label by name and we want to auto-pick a sensible default.
SUGGESTED_LABEL_COLORS = {
    "public":       "#22C55E",
    "internal":     "#EAB308",
    "confidential": "#EF4444",
    "secret":       "#DC2626",
    "restricted":   "#64748B",
    "private":      "#A855F7",
    "draft":        "#94A3B8",
}


def suggest_label_color(name: str) -> str:
    return SUGGESTED_LABEL_COLORS.get((name or "").strip().lower(), "#64748B")


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(255), nullable=False)
    subdomain = Column(String(100), unique=True, nullable=False)
    email_domain = Column(String(255), unique=True, nullable=True)  # e.g. bsc.rw → auto-detects org on login
    subscription_plan = Column(String(50), default="starter")
    is_active = Column(Boolean, default=True)
    # Branding — used as letterhead on every form's PDF export
    header_image_path = Column(String(500), nullable=True)
    footer_image_path = Column(String(500), nullable=True)
    letterhead_accent = Column(String(20), nullable=True)        # e.g. "#0066B3"
    classification_labels = Column(JSON, nullable=True)          # list[str], falls back to DEFAULT_CLASSIFICATION_LABELS
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    departments = relationship("Department", back_populates="organization")
    users = relationship("User", back_populates="organization")
    form_definitions = relationship("FormDefinition", back_populates="organization")
    approval_templates = relationship("ApprovalTemplate", back_populates="organization")

    @property
    def has_header_image(self) -> bool:
        return bool(self.header_image_path)

    @property
    def has_footer_image(self) -> bool:
        return bool(self.footer_image_path)


class Department(Base):
    __tablename__ = "departments"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(200), nullable=False)
    parent_department_id = Column(String(36), ForeignKey("departments.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="departments")
    users = relationship("User", back_populates="department")
    sub_departments = relationship("Department", backref="parent_department", remote_side=[id])
