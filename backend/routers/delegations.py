from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.user import User, RoleName
from models.delegation import Delegation
from models.approval import ApprovalInstance, ApprovalStepStatus
from schemas.delegation import DelegationCreate, DelegationAdminCreate, DelegationResponse
from core.security import get_current_active_user
from core.permissions import require_roles
from services import audit_service

router = APIRouter(prefix="/delegations", tags=["Delegations"])


@router.post("", response_model=DelegationResponse)
def create_delegation(
    payload: DelegationCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Approver delegates their approval rights to another user."""
    # Verify delegate exists in same org
    delegate = db.query(User).filter(
        User.id == payload.delegate_user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not delegate:
        raise HTTPException(status_code=404, detail="Delegate user not found")
    if delegate.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delegate to yourself")

    from models.user import Role, UserRole
    from models.approval import ApprovalTemplateStep

    if payload.role_id:
        # Per-role delegation: validate role exists in org and delegator holds it
        role = db.query(Role).filter(
            Role.id == payload.role_id,
            Role.organization_id == current_user.organization_id
        ).first()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        holds_role = db.query(UserRole).filter(
            UserRole.user_id == current_user.id,
            UserRole.role_id == payload.role_id
        ).first()
        if not holds_role:
            raise HTTPException(status_code=400, detail="You do not hold this role and cannot delegate it")

    # Deactivate any existing active delegation that matches this scope
    # (same role_id, or both are "all" / role_id IS NULL)
    existing_q = db.query(Delegation).filter(
        Delegation.original_approver_id == current_user.id,
        Delegation.is_active == True
    )
    if payload.role_id:
        existing_q = existing_q.filter(Delegation.role_id == payload.role_id)
    else:
        existing_q = existing_q.filter(Delegation.role_id.is_(None))
    existing_q.update({"is_active": False}, synchronize_session=False)

    delegation = Delegation(
        organization_id=current_user.organization_id,
        original_approver_id=current_user.id,
        delegate_user_id=payload.delegate_user_id,
        role_id=payload.role_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        created_by=current_user.id
    )
    db.add(delegation)
    db.flush()

    # Transfer pending/active steps to the delegate.
    # - role_id set: only steps that resolve to this specific role
    # - role_id None ("delegate all"): every active/waiting step assigned to me
    transfer_q = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status.in_([ApprovalStepStatus.active, ApprovalStepStatus.waiting])
    )
    if payload.role_id:
        role_step_ids = [
            s.id for s in db.query(ApprovalTemplateStep).filter(
                ApprovalTemplateStep.role_id == payload.role_id
            ).all()
        ]
        if not role_step_ids:
            transfer_q = transfer_q.filter(False)
        else:
            transfer_q = transfer_q.filter(ApprovalInstance.template_step_id.in_(role_step_ids))
    transfer_q.update({
        "approver_user_id": payload.delegate_user_id,
        "delegated_from_user_id": current_user.id
    }, synchronize_session=False)

    db.commit()
    db.refresh(delegation)

    audit_service.log_event(
        db, current_user.organization_id, "DELEGATION_CREATED",
        user_id=current_user.id, entity_type="Delegation", entity_id=delegation.id,
        details={"delegate_user_id": payload.delegate_user_id}
    )
    return delegation


@router.post("/{delegation_id}/return")
def return_delegation(
    delegation_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Return approval rights back to original approver."""
    from datetime import datetime

    delegation = db.query(Delegation).filter(
        Delegation.id == delegation_id,
        Delegation.organization_id == current_user.organization_id,
        Delegation.is_active == True
    ).first()
    if not delegation:
        raise HTTPException(status_code=404, detail="Active delegation not found")

    # Only original approver or admin can return
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    if delegation.original_approver_id != current_user.id and RoleName.admin not in role_names:
        raise HTTPException(status_code=403, detail="Not authorized to return this delegation")

    # Transfer delegated steps back, scoped to this role if role_id is set
    from models.approval import ApprovalTemplateStep
    step_filter = [
        ApprovalInstance.organization_id == delegation.organization_id,
        ApprovalInstance.approver_user_id == delegation.delegate_user_id,
        ApprovalInstance.delegated_from_user_id == delegation.original_approver_id,
        ApprovalInstance.status.in_([ApprovalStepStatus.active, ApprovalStepStatus.waiting])
    ]
    if delegation.role_id:
        role_step_ids = [
            s.id for s in db.query(ApprovalTemplateStep).filter(
                ApprovalTemplateStep.role_id == delegation.role_id
            ).all()
        ]
        step_filter.append(ApprovalInstance.template_step_id.in_(role_step_ids))

    db.query(ApprovalInstance).filter(*step_filter).update({
        "approver_user_id": delegation.original_approver_id,
        "delegated_from_user_id": None
    }, synchronize_session=False)

    delegation.is_active = False
    delegation.returned_at = datetime.utcnow()
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "DELEGATION_RETURNED",
        user_id=current_user.id, entity_type="Delegation", entity_id=delegation.id
    )
    return {"message": "Delegation returned successfully"}


@router.get("", response_model=List[DelegationResponse])
def list_delegations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List my active delegations (as original or as delegate)."""
    today = date.today()
    delegations = db.query(Delegation).filter(
        Delegation.organization_id == current_user.organization_id,
        Delegation.is_active == True,
        (
            (Delegation.original_approver_id == current_user.id) |
            (Delegation.delegate_user_id == current_user.id)
        )
    ).all()
    return delegations


@router.post("/admin-create", response_model=DelegationResponse)
def admin_create_delegation(
    payload: DelegationAdminCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin creates a delegation on behalf of any user."""
    from models.user import Role, UserRole

    original = db.query(User).filter(
        User.id == payload.original_approver_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not original:
        raise HTTPException(status_code=404, detail="Original approver not found")
    delegate = db.query(User).filter(
        User.id == payload.delegate_user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not delegate:
        raise HTTPException(status_code=404, detail="Delegate user not found")
    if payload.original_approver_id == payload.delegate_user_id:
        raise HTTPException(status_code=400, detail="Cannot delegate to the same user")

    from models.approval import ApprovalTemplateStep

    if payload.role_id:
        # Per-role: validate role exists in org and original approver holds it
        role = db.query(Role).filter(
            Role.id == payload.role_id,
            Role.organization_id == current_user.organization_id
        ).first()
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        holds_role = db.query(UserRole).filter(
            UserRole.user_id == payload.original_approver_id,
            UserRole.role_id == payload.role_id
        ).first()
        if not holds_role:
            raise HTTPException(status_code=400, detail="Original approver does not hold this role")

    # Deactivate any existing active delegation matching this scope
    existing_q = db.query(Delegation).filter(
        Delegation.original_approver_id == payload.original_approver_id,
        Delegation.is_active == True
    )
    if payload.role_id:
        existing_q = existing_q.filter(Delegation.role_id == payload.role_id)
    else:
        existing_q = existing_q.filter(Delegation.role_id.is_(None))
    existing_q.update({"is_active": False}, synchronize_session=False)

    delegation = Delegation(
        organization_id=current_user.organization_id,
        original_approver_id=payload.original_approver_id,
        delegate_user_id=payload.delegate_user_id,
        role_id=payload.role_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        reason=payload.reason,
        created_by=current_user.id
    )
    db.add(delegation)
    db.flush()

    # Transfer pending/active steps to the delegate.
    # role_id set → scoped to that role's steps; role_id None → every step assigned to original.
    transfer_q = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == payload.original_approver_id,
        ApprovalInstance.status.in_([ApprovalStepStatus.active, ApprovalStepStatus.waiting])
    )
    if payload.role_id:
        role_step_ids = [
            s.id for s in db.query(ApprovalTemplateStep).filter(
                ApprovalTemplateStep.role_id == payload.role_id
            ).all()
        ]
        if not role_step_ids:
            transfer_q = transfer_q.filter(False)
        else:
            transfer_q = transfer_q.filter(ApprovalInstance.template_step_id.in_(role_step_ids))
    transfer_q.update({
        "approver_user_id": payload.delegate_user_id,
        "delegated_from_user_id": payload.original_approver_id
    }, synchronize_session=False)

    db.commit()
    db.refresh(delegation)
    audit_service.log_event(
        db, current_user.organization_id, "DELEGATION_CREATED",
        user_id=current_user.id, entity_type="Delegation", entity_id=delegation.id,
        details={"original_approver_id": payload.original_approver_id, "delegate_user_id": payload.delegate_user_id}
    )
    return delegation


@router.get("/all", response_model=List[DelegationResponse])
def list_all_delegations(
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin: see all delegations in the org."""
    delegations = db.query(Delegation).filter(
        Delegation.organization_id == current_user.organization_id
    ).order_by(Delegation.created_at.desc()).all()
    return delegations
