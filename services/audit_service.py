from sqlalchemy.orm import Session
from models.audit import AuditLog
from typing import Optional


def log_event(
    db: Session,
    organization_id: str,
    action: str,
    user_id: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip_address: Optional[str] = None
):
    """Write an audit log entry."""
    entry = AuditLog(
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details or {},
        ip_address=ip_address
    )
    db.add(entry)
    db.commit()
