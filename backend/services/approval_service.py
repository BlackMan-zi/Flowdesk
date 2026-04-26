from datetime import datetime, date
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from models.approval import (
    ApprovalTemplate, ApprovalTemplateStep, ApprovalInstance,
    RoleType, ApprovalStepStatus
)
from models.form import FormInstance, FormVersion, FormStatus
from models.user import User, UserRole, Role
from models.delegation import Delegation
from services import audit_service


def resolve_approver_for_step(
    db: Session,
    step: ApprovalTemplateStep,
    initiator: User,
    selected_approver_ids: Optional[Dict[str, str]] = None
) -> Optional[str]:
    """Resolve actual approver user ID for a given template step."""

    if step.role_type == RoleType.specific_user:
        return step.specific_user_id

    if step.role_type == RoleType.selected_at_submission:
        if selected_approver_ids:
            return selected_approver_ids.get(step.id)
        return None

    if step.role_type == RoleType.hierarchy:
        level = step.hierarchy_level
        if level == "manager":
            return initiator.manager_id
        elif level == "sn_manager":
            return initiator.sn_manager_id
        elif level == "hod":
            return initiator.hod_id
        return None

    if step.role_type in [RoleType.functional, RoleType.executive]:
        if not step.role_id:
            return None
        from models.organization import Department
        # Collect all users in this org with the required role
        user_ids = [
            ur.user_id for ur in
            db.query(UserRole).filter(UserRole.role_id == step.role_id).all()
        ]
        if not user_ids:
            return None
        # Prefer someone in the same top-level department as the initiator
        dept_id = initiator.department_id
        if dept_id:
            dept = db.query(Department).filter(Department.id == dept_id).first()
            top_dept_id = dept.parent_department_id if (dept and dept.parent_department_id) else dept_id
            # Sub-dept IDs under same top-level dept
            sibling_ids = [
                d.id for d in db.query(Department).filter(
                    (Department.id == top_dept_id) |
                    (Department.parent_department_id == top_dept_id)
                ).all()
            ]
            scoped = db.query(User).filter(
                User.id.in_(user_ids),
                User.organization_id == initiator.organization_id,
                User.department_id.in_(sibling_ids)
            ).first()
            if scoped:
                return scoped.id
        # Fall back: any user with this role in the org
        fallback = db.query(User).filter(
            User.id.in_(user_ids),
            User.organization_id == initiator.organization_id
        ).first()
        return fallback.id if fallback else None

    return None


def get_active_delegate(db: Session, user_id: str) -> Optional[str]:
    """Check if this user has an active delegation; return delegate's user_id."""
    today = date.today()
    delegation = db.query(Delegation).filter(
        Delegation.original_approver_id == user_id,
        Delegation.is_active == True,
        Delegation.start_date <= today,
        Delegation.end_date >= today
    ).first()
    if delegation:
        return delegation.delegate_user_id
    return None


def initialize_approval_steps(
    db: Session,
    form_version: FormVersion,
    form_instance: FormInstance,
    initiator: User,
    selected_approver_ids: Optional[Dict[str, str]] = None
) -> List[ApprovalInstance]:
    """Create all ApprovalInstance rows for the form version."""
    # Get template
    form_def = form_instance.form_definition
    if not form_def or not form_def.approval_template_id:
        return []

    template = db.query(ApprovalTemplate).filter(
        ApprovalTemplate.id == form_def.approval_template_id
    ).first()
    if not template or not template.is_active:
        return []

    steps = db.query(ApprovalTemplateStep).filter(
        ApprovalTemplateStep.template_id == template.id
    ).order_by(ApprovalTemplateStep.step_order).all()

    instances = []
    for idx, step in enumerate(steps):
        approver_id = resolve_approver_for_step(
            db, step, initiator, selected_approver_ids
        )

        if not approver_id and step.skip_if_missing:
            # Create skipped instance for audit trail
            ai = ApprovalInstance(
                organization_id=form_instance.organization_id,
                form_version_id=form_version.id,
                template_step_id=step.id,
                step_order=step.step_order,
                step_label=step.step_label,
                approver_user_id=None,
                status=ApprovalStepStatus.skipped
            )
            db.add(ai)
            instances.append(ai)
            continue

        if not approver_id:
            raise ValueError(
                f"Cannot submit: no approver could be resolved for step '{step.step_label}'. "
                f"Ensure the submitter has a Manager, SN Manager, and HOD assigned in their user profile "
                f"(Admin → Users → edit user)."
            )

        # Check delegation
        delegated_from = None
        if approver_id and step.delegation_allowed:
            delegate = get_active_delegate(db, approver_id)
            if delegate:
                delegated_from = approver_id
                approver_id = delegate

        # First non-skipped step is active; the rest wait
        has_active = any(i for i in instances if i.status == ApprovalStepStatus.active)
        ai = ApprovalInstance(
            organization_id=form_instance.organization_id,
            form_version_id=form_version.id,
            template_step_id=step.id,
            step_order=step.step_order,
            step_label=step.step_label,
            approver_user_id=approver_id,
            delegated_from_user_id=delegated_from,
            status=ApprovalStepStatus.waiting if has_active else ApprovalStepStatus.active
        )
        db.add(ai)
        instances.append(ai)

    form_instance.current_status = FormStatus.pending
    db.commit()
    return instances


def approve_step(
    db: Session,
    approval_instance: ApprovalInstance,
    acting_user: User,
    notes: Optional[str] = None,
    signature_id: Optional[str] = None
) -> bool:
    """Approve the current step; activate next. Returns True if all done."""
    approval_instance.status = ApprovalStepStatus.approved
    approval_instance.signed_at = datetime.utcnow()
    approval_instance.notes = notes
    if signature_id:
        approval_instance.signature_id = signature_id

    db.flush()

    # Activate next waiting step
    next_step = db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == approval_instance.form_version_id,
        ApprovalInstance.status == ApprovalStepStatus.waiting
    ).order_by(ApprovalInstance.step_order).first()

    if next_step:
        next_step.status = ApprovalStepStatus.active
        db.commit()
        return False  # Not fully done yet

    # All steps approved — mark form completed
    form_version = db.query(FormVersion).filter(
        FormVersion.id == approval_instance.form_version_id
    ).first()
    if form_version:
        form_instance = form_version.form_instance
        form_instance.current_status = FormStatus.approved
        form_instance.completed_at = datetime.utcnow()

    db.commit()
    return True  # All approvals done


def reject_step(
    db: Session,
    approval_instance: ApprovalInstance,
    acting_user: User,
    notes: str
) -> FormInstance:
    """Reject the form entirely."""
    approval_instance.status = ApprovalStepStatus.rejected
    approval_instance.signed_at = datetime.utcnow()
    approval_instance.notes = notes

    # Cancel all waiting/active steps
    db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == approval_instance.form_version_id,
        ApprovalInstance.status.in_([ApprovalStepStatus.waiting, ApprovalStepStatus.active]),
        ApprovalInstance.id != approval_instance.id
    ).update({"status": ApprovalStepStatus.rejected})

    form_version = db.query(FormVersion).filter(
        FormVersion.id == approval_instance.form_version_id
    ).first()
    form_instance = form_version.form_instance
    form_instance.current_status = FormStatus.rejected

    db.commit()
    return form_instance


def send_back_step(
    db: Session,
    approval_instance: ApprovalInstance,
    acting_user: User,
    notes: str
) -> FormInstance:
    """Send form back for correction."""
    approval_instance.status = ApprovalStepStatus.sent_back
    approval_instance.signed_at = datetime.utcnow()
    approval_instance.notes = notes

    # Cancel waiting steps
    db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == approval_instance.form_version_id,
        ApprovalInstance.status == ApprovalStepStatus.waiting
    ).update({"status": ApprovalStepStatus.sent_back})

    form_version = db.query(FormVersion).filter(
        FormVersion.id == approval_instance.form_version_id
    ).first()
    form_instance = form_version.form_instance
    form_instance.current_status = FormStatus.returned_for_correction

    db.commit()
    return form_instance


def get_pending_approvals_for_user(
    db: Session,
    user: User
) -> List[ApprovalInstance]:
    """Get all Active approval steps assigned to this user."""
    return db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == user.organization_id,
        ApprovalInstance.approver_user_id == user.id,
        ApprovalInstance.status == ApprovalStepStatus.active
    ).all()
