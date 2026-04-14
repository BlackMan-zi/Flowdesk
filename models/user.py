import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from database import Base
import enum


def gen_uuid():
    return str(uuid.uuid4())


class UserStatus(str, enum.Enum):
    active = "Active"
    not_active = "Not Active"
    pending = "Pending"  # before first login


class RoleCategory(str, enum.Enum):
    hierarchy = "Hierarchy"
    functional = "Functional"
    executive = "Executive"
    system = "System"


class RoleName(str, enum.Enum):
    # System roles
    admin = "Admin"
    standard_user = "Standard User"
    report_manager = "Report Manager"   # can create users + see reports
    observer = "Observer"
    # Hierarchy roles
    manager = "Manager"
    sn_manager = "SN Manager"
    hod = "HOD"
    # Functional roles
    hr = "HR"
    hr_admin = "HR & Admin"
    finance = "Finance"
    supply_chain = "Supply Chain"
    it = "IT"
    # Executive roles
    cfo = "CFO"
    ceo = "CEO"
    chief_corporate = "Chief Corporate"


class Role(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(100), nullable=False)
    role_category = Column(SAEnum(RoleCategory), nullable=False)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user_roles = relationship("UserRole", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    organization_id = Column(String(36), ForeignKey("organizations.id"), nullable=False)
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    department_id = Column(String(36), ForeignKey("departments.id"), nullable=True)

    # Hierarchy
    manager_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    sn_manager_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    hod_id = Column(String(36), ForeignKey("users.id"), nullable=True)

    status = Column(SAEnum(UserStatus), default=UserStatus.pending)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(100), nullable=True)
    must_reset_password = Column(Boolean, default=True)
    temp_password = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships
    organization = relationship("Organization", back_populates="users")
    department = relationship("Department", back_populates="users")
    user_roles = relationship("UserRole", back_populates="user", foreign_keys="UserRole.user_id")
    manager = relationship("User", foreign_keys=[manager_id], remote_side="User.id", backref="direct_reports")
    sn_manager = relationship("User", foreign_keys=[sn_manager_id], remote_side="User.id")
    hod = relationship("User", foreign_keys=[hod_id], remote_side="User.id")


class UserRole(Base):
    __tablename__ = "user_roles"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    role_id = Column(String(36), ForeignKey("roles.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    assigned_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    # Relationships
    user = relationship("User", back_populates="user_roles", foreign_keys=[user_id])
    role = relationship("Role", back_populates="user_roles")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    token = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
