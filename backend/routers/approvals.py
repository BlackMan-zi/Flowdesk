from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from database import get_db
from models.user import User, RoleName, UserRole
from models.form import FormInstance, FormVersion, FormStatus, FormFieldValue
from models.approval import ApprovalInstance, ApprovalStepStatus, ApprovalTemplateCCRecipient, RoleType
from models.document import Signature, SignatureType, DocumentShare
from schemas.approval import ApprovalActionRequest, ApprovalInstanceResponse
from core.security import get_current_active_user
from services import approval_service, audit_service, document_service
from services.email_service import (
    send_approval_request_email, send_step_approved_email,
    send_rejection_email, send_sent_back_email, send_completion_email
)

router = APIRouter(prefix="/approvals", tags=["Approvals"])


def _get_active_approval_for_user(
    db: Session,
    form_instance_id: str,
    current_user: User
) -> ApprovalInstance:
    """Get the current active approval step for this user on this form."""
    instance = db.query(FormInstance).filter(
        FormInstance.id == form_instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found")

    current_ver = db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()
    if not current_ver:
        raise HTTPException(status_code=404, detail="Form version not found")

    ap = db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == current_ver.id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status == ApprovalStepStatus.active
    ).first()
    if not ap:
        raise HTTPException(
            status_code=403,
            detail="No active approval step assigned to you for this form"
        )
    return ap


@router.get("/pending")
def get_pending_approvals(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all approval steps currently waiting for the logged-in user."""
    pending = approval_service.get_pending_approvals_for_user(db, current_user)
    results = []
    for ap in pending:
        ver = db.query(FormVersion).filter(FormVersion.id == ap.form_version_id).first()
        if not ver:
            continue
        inst = ver.form_instance
        # Total steps for this version
        from models.approval import ApprovalInstance as AI
        total_steps = db.query(AI).filter(AI.form_version_id == ver.id).count()
        # Days waiting
        days_waiting = None
        if inst.submitted_at:
            days_waiting = (datetime.utcnow() - inst.submitted_at).days
        # Hierarchy level from template step
        hierarchy_level = ap.template_step.hierarchy_level if ap.template_step else None

        results.append({
            "approval_instance_id": ap.id,
            "form_instance_id": inst.id,
            "reference_number": inst.reference_number,
            "form_name": inst.form_definition.name if inst.form_definition else "—",
            "initiator": inst.creator.name if inst.creator else "—",
            "initiator_email": inst.creator.email if inst.creator else None,
            "submitted_at": inst.submitted_at,
            "step_label": ap.step_label,
            "step_order": ap.step_order,
            "total_steps": total_steps,
            "days_waiting": days_waiting,
            "hierarchy_level": hierarchy_level,
            "current_version": inst.current_version,
            "delegated_from": ap.delegated_from.name if ap.delegated_from_user_id and ap.delegated_from else None
        })
    return results


@router.post("/{form_instance_id}/approve")
def approve(
    form_instance_id: str,
    payload: ApprovalActionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    ap = _get_active_approval_for_user(db, form_instance_id, current_user)
    instance = ap.form_version.form_instance

    # Save approver-filled field values
    if payload.field_values:
        for fv_input in payload.field_values:
            existing = db.query(FormFieldValue).filter(
                FormFieldValue.form_version_id == ap.form_version_id,
                FormFieldValue.form_field_id == fv_input.form_field_id
            ).first()
            if existing:
                existing.value = fv_input.value
            else:
                db.add(FormFieldValue(
                    form_version_id=ap.form_version_id,
                    form_field_id=fv_input.form_field_id,
                    value=fv_input.value
                ))

    # Save signature if provided
    sig_id = None
    if payload.signature_data:
        sig = Signature(
            organization_id=current_user.organization_id,
            approval_instance_id=ap.id,
            user_id=current_user.id,
            signature_type=SignatureType.canvas,
            signature_data=payload.signature_data
        )
        db.add(sig)
        db.flush()
        sig_id = sig.id

    all_done = approval_service.approve_step(db, ap, current_user, payload.notes, sig_id)

    # Find next approver (if any)
    next_step = db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == ap.form_version_id,
        ApprovalInstance.status == ApprovalStepStatus.active
    ).first()

    try:
        if all_done:
            # Generate PDF — use template overlay if available, else ReportLab fallback
            from services.pdf_overlay_service import generate_pdf_with_overlay
            org_name = instance.organization.name if hasattr(instance, "organization") and instance.organization else "FlowDesk"
            pdf_bytes = generate_pdf_with_overlay(db, instance, org_name) \
                        or document_service.generate_final_pdf(db, instance, organization_name=org_name)
            gen_doc = document_service.save_generated_document(
                db, instance, pdf_bytes, current_user.organization_id, current_user.id
            )

            # --- DocumentShare: give access to initiator, approvers, and CC recipients ---
            if gen_doc:
                seen_user_ids = set()

                def _share(user_id, reason):
                    if user_id and user_id not in seen_user_ids:
                        seen_user_ids.add(user_id)
                        db.add(DocumentShare(
                            document_id=gen_doc.id,
                            organization_id=current_user.organization_id,
                            user_id=user_id,
                            share_reason=reason
                        ))

                # 1. Initiator
                _share(instance.created_by, "initiator")

                # 2. All approvers (approved steps on the final version)
                final_ver = db.query(FormVersion).filter(
                    FormVersion.form_instance_id == instance.id,
                    FormVersion.version_number == instance.current_version
                ).first()
                if final_ver:
                    approved_steps = db.query(ApprovalInstance).filter(
                        ApprovalInstance.form_version_id == final_ver.id,
                        ApprovalInstance.status == ApprovalStepStatus.approved
                    ).all()
                    for step in approved_steps:
                        _share(step.approver_user_id, "approver")

                # 3. CC recipients from the approval template
                template_id = instance.form_definition.approval_template_id if instance.form_definition else None
                if template_id:
                    cc_list = db.query(ApprovalTemplateCCRecipient).filter(
                        ApprovalTemplateCCRecipient.template_id == template_id
                    ).all()
                    initiator = instance.creator
                    for cc in cc_list:
                        uid = None
                        if cc.role_type == RoleType.specific_user:
                            uid = cc.specific_user_id
                        elif cc.role_type == RoleType.hierarchy:
                            lvl = cc.hierarchy_level
                            if lvl == "manager":
                                uid = initiator.manager_id
                            elif lvl == "sn_manager":
                                uid = initiator.sn_manager_id
                            elif lvl == "hod":
                                uid = initiator.hod_id
                        elif cc.role_type in (RoleType.functional, RoleType.executive):
                            if cc.role_id:
                                ur = db.query(UserRole).filter(UserRole.role_id == cc.role_id).first()
                                uid = ur.user_id if ur else None
                        _share(uid, "cc")

                db.commit()

            send_completion_email(
                to_email=instance.creator.email,
                initiator_name=instance.creator.name,
                form_name=instance.form_definition.name if instance.form_definition else "Form",
                reference_number=instance.reference_number,
                form_instance_id=instance.id,
                pdf_data=pdf_bytes
            )
        else:
            # Notify next approver
            next_approver_name = None
            if next_step and next_step.approver:
                next_approver_name = next_step.approver.name
                send_approval_request_email(
                    to_email=next_step.approver.email,
                    approver_name=next_step.approver.name,
                    initiator_name=instance.creator.name,
                    form_name=instance.form_definition.name if instance.form_definition else "Form",
                    reference_number=instance.reference_number,
                    step_label=next_step.step_label or "Approval Step",
                    form_instance_id=instance.id
                )

            send_step_approved_email(
                to_email=instance.creator.email,
                initiator_name=instance.creator.name,
                form_name=instance.form_definition.name if instance.form_definition else "Form",
                reference_number=instance.reference_number,
                approved_by=current_user.name,
                next_approver=next_approver_name,
                form_instance_id=instance.id
            )
    except Exception as e:
        print(f"[POST-APPROVE WARNING] {e}")

    audit_service.log_event(
        db, current_user.organization_id, "STEP_APPROVED",
        user_id=current_user.id, entity_type="ApprovalInstance", entity_id=ap.id,
        details={"form_instance_id": form_instance_id, "all_done": all_done}
    )
    return {"message": "Step approved", "all_approvals_complete": all_done}


@router.post("/{form_instance_id}/reject")
def reject(
    form_instance_id: str,
    payload: ApprovalActionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not payload.notes:
        raise HTTPException(status_code=400, detail="Rejection reason (notes) is required")

    ap = _get_active_approval_for_user(db, form_instance_id, current_user)
    instance = approval_service.reject_step(db, ap, current_user, payload.notes)

    try:
        send_rejection_email(
            to_email=instance.creator.email,
            initiator_name=instance.creator.name,
            form_name=instance.form_definition.name if instance.form_definition else "Form",
            reference_number=instance.reference_number,
            rejected_by=current_user.name,
            rejection_notes=payload.notes,
            form_instance_id=instance.id
        )
    except Exception as e:
        print(f"[EMAIL WARNING] {e}")

    audit_service.log_event(
        db, current_user.organization_id, "FORM_REJECTED",
        user_id=current_user.id, entity_type="ApprovalInstance", entity_id=ap.id
    )
    return {"message": "Form rejected"}


@router.post("/{form_instance_id}/send-back")
def send_back(
    form_instance_id: str,
    payload: ApprovalActionRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if not payload.notes:
        raise HTTPException(status_code=400, detail="Correction notes are required when sending back")

    ap = _get_active_approval_for_user(db, form_instance_id, current_user)
    instance = approval_service.send_back_step(db, ap, current_user, payload.notes)

    # Create new version
    from services.form_service import create_new_version_on_correction
    create_new_version_on_correction(db, instance, current_user, payload.notes)

    try:
        send_sent_back_email(
            to_email=instance.creator.email,
            initiator_name=instance.creator.name,
            form_name=instance.form_definition.name if instance.form_definition else "Form",
            reference_number=instance.reference_number,
            sent_back_by=current_user.name,
            correction_notes=payload.notes,
            form_instance_id=instance.id
        )
    except Exception as e:
        print(f"[EMAIL WARNING] {e}")

    audit_service.log_event(
        db, current_user.organization_id, "FORM_SENT_BACK",
        user_id=current_user.id, entity_type="ApprovalInstance", entity_id=ap.id
    )
    return {"message": "Form sent back for correction"}


# ── Admin override actions ────────────────────────────────────────────────────

from core.permissions import require_roles
from pydantic import BaseModel as _BM

class AdminActionRequest(_BM):
    notes: Optional[str] = None


@router.post("/{form_instance_id}/admin-cancel")
def admin_cancel(
    form_instance_id: str,
    payload: AdminActionRequest,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin force-cancels a form regardless of its current state."""
    instance = db.query(FormInstance).filter(
        FormInstance.id == form_instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form not found")

    terminal = {FormStatus.approved, FormStatus.completed, FormStatus.rejected}
    if instance.current_status in terminal:
        raise HTTPException(status_code=400, detail="Form is already in a terminal state")

    # Cancel all pending/active approval steps on the current version
    current_ver = db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()
    if current_ver:
        db.query(ApprovalInstance).filter(
            ApprovalInstance.form_version_id == current_ver.id,
            ApprovalInstance.status.in_([ApprovalStepStatus.waiting, ApprovalStepStatus.active])
        ).update({
            "status": ApprovalStepStatus.rejected,
            "notes": payload.notes or "Cancelled by administrator"
        }, synchronize_session=False)

    instance.current_status = FormStatus.rejected
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "ADMIN_FORM_CANCELLED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=form_instance_id,
        details={"notes": payload.notes}
    )
    try:
        send_rejection_email(
            to_email=instance.creator.email,
            initiator_name=instance.creator.name,
            form_name=instance.form_definition.name if instance.form_definition else "Form",
            reference_number=instance.reference_number,
            rejected_by=f"Administrator ({current_user.name})",
            rejection_notes=payload.notes or "Cancelled by administrator",
            form_instance_id=instance.id
        )
    except Exception as e:
        print(f"[EMAIL WARNING] {e}")

    return {"message": "Form cancelled by administrator"}


@router.post("/{form_instance_id}/admin-send-back")
def admin_send_back(
    form_instance_id: str,
    payload: AdminActionRequest,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin returns a form to the initiator for correction."""
    if not payload.notes:
        raise HTTPException(status_code=400, detail="Notes are required when sending back for correction")

    instance = db.query(FormInstance).filter(
        FormInstance.id == form_instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form not found")

    if instance.current_status not in (FormStatus.pending, FormStatus.submitted):
        raise HTTPException(status_code=400, detail="Can only send back forms that are currently under review")

    # Cancel active/waiting steps on the current version
    current_ver = db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()
    if current_ver:
        db.query(ApprovalInstance).filter(
            ApprovalInstance.form_version_id == current_ver.id,
            ApprovalInstance.status.in_([ApprovalStepStatus.waiting, ApprovalStepStatus.active])
        ).update({
            "status": ApprovalStepStatus.sent_back,
            "notes": payload.notes
        }, synchronize_session=False)

    # Create a new draft version for the initiator to edit
    from services.form_service import create_new_version_on_correction
    create_new_version_on_correction(db, instance, current_user, payload.notes)
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "ADMIN_FORM_SENT_BACK",
        user_id=current_user.id, entity_type="FormInstance", entity_id=form_instance_id,
        details={"notes": payload.notes}
    )
    try:
        send_sent_back_email(
            to_email=instance.creator.email,
            initiator_name=instance.creator.name,
            form_name=instance.form_definition.name if instance.form_definition else "Form",
            reference_number=instance.reference_number,
            sent_back_by=f"Administrator ({current_user.name})",
            correction_notes=payload.notes,
            form_instance_id=instance.id
        )
    except Exception as e:
        print(f"[EMAIL WARNING] {e}")

    return {"message": "Form returned to initiator for correction"}


class ReassignStepRequest(_BM):
    new_approver_user_id: str
    notes: Optional[str] = None


@router.post("/{form_instance_id}/reassign-step")
def reassign_step(
    form_instance_id: str,
    payload: ReassignStepRequest,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin reassigns the current active approval step to a different user."""
    instance = db.query(FormInstance).filter(
        FormInstance.id == form_instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form not found")

    current_ver = db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()
    if not current_ver:
        raise HTTPException(status_code=404, detail="Form version not found")

    active_step = db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == current_ver.id,
        ApprovalInstance.status == ApprovalStepStatus.active
    ).first()
    if not active_step:
        raise HTTPException(status_code=400, detail="No active approval step found")

    new_approver = db.query(User).filter(
        User.id == payload.new_approver_user_id,
        User.organization_id == current_user.organization_id
    ).first()
    if not new_approver:
        raise HTTPException(status_code=404, detail="New approver not found")

    old_approver_id = active_step.approver_user_id
    active_step.approver_user_id = payload.new_approver_user_id
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id, "STEP_REASSIGNED",
        user_id=current_user.id, entity_type="ApprovalInstance", entity_id=active_step.id,
        details={"old_approver_id": old_approver_id, "new_approver_id": payload.new_approver_user_id, "notes": payload.notes}
    )
    try:
        send_approval_request_email(
            to_email=new_approver.email,
            approver_name=new_approver.name,
            initiator_name=instance.creator.name,
            form_name=instance.form_definition.name if instance.form_definition else "Form",
            reference_number=instance.reference_number,
            step_label=active_step.step_label or "Approval Step",
            form_instance_id=instance.id
        )
    except Exception as e:
        print(f"[EMAIL WARNING] {e}")

    return {"message": "Step reassigned", "new_approver": new_approver.name}


@router.get("/history")
def approval_history(
    action: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """All approval actions this user has taken, with optional filters."""
    query = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status.in_([
            ApprovalStepStatus.approved,
            ApprovalStepStatus.rejected,
            ApprovalStepStatus.sent_back
        ])
    )
    if action:
        try:
            query = query.filter(ApprovalInstance.status == ApprovalStepStatus(action))
        except ValueError:
            pass
    if date_from:
        try:
            query = query.filter(ApprovalInstance.signed_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            query = query.filter(ApprovalInstance.signed_at <= datetime.fromisoformat(date_to + "T23:59:59"))
        except ValueError:
            pass

    completed = query.order_by(ApprovalInstance.signed_at.desc()).all()

    results = []
    for ap in completed:
        ver = db.query(FormVersion).filter(FormVersion.id == ap.form_version_id).first()
        if not ver:
            continue
        inst = ver.form_instance
        results.append({
            "approval_instance_id": ap.id,
            "form_instance_id": inst.id,
            "reference_number": inst.reference_number,
            "form_name": inst.form_definition.name if inst.form_definition else "—",
            "initiator": inst.creator.name if inst.creator else "—",
            "action": ap.status.value,
            "step_label": ap.step_label,
            "signed_at": ap.signed_at,
            "notes": ap.notes
        })
    return results
