from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from database import get_db
from models.user import User, RoleName
from models.form import FormInstance, FormStatus
from models.approval import ApprovalInstance, ApprovalStepStatus
from models.document import GeneratedDocument
from models.audit import AuditLog
from core.security import get_current_active_user
from core.permissions import require_roles

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/initiator")
def initiator_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """My forms grouped by status."""
    all_forms = db.query(FormInstance).filter(
        FormInstance.organization_id == current_user.organization_id,
        FormInstance.created_by == current_user.id
    ).order_by(FormInstance.created_at.desc()).all()

    by_status = {}
    for inst in all_forms:
        status_key = inst.current_status.value
        if status_key not in by_status:
            by_status[status_key] = []
        by_status[status_key].append({
            "id": inst.id,
            "reference_number": inst.reference_number,
            "form_name": inst.form_definition.name if inst.form_definition else "—",
            "current_version": inst.current_version,
            "submitted_at": inst.submitted_at,
            "completed_at": inst.completed_at,
            "created_at": inst.created_at
        })

    return {
        "total": len(all_forms),
        "by_status": by_status,
        "summary": {
            "draft": len([f for f in all_forms if f.current_status == FormStatus.draft]),
            "pending": len([f for f in all_forms if f.current_status == FormStatus.pending]),
            "completed": len([f for f in all_forms if f.current_status == FormStatus.completed]),
            "rejected": len([f for f in all_forms if f.current_status == FormStatus.rejected]),
            "returned_for_correction": len([
                f for f in all_forms if f.current_status == FormStatus.returned_for_correction
            ]),
        }
    }


@router.get("/approver")
def approver_dashboard(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Pending, delegated, approved, and rejected for this approver."""
    pending = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status == ApprovalStepStatus.active
    ).all()

    approved = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status == ApprovalStepStatus.approved
    ).order_by(ApprovalInstance.signed_at.desc()).limit(20).all()

    rejected = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status == ApprovalStepStatus.rejected
    ).order_by(ApprovalInstance.signed_at.desc()).limit(20).all()

    def _format_ai(ais, include_form=True):
        results = []
        for ai in ais:
            ver = ai.form_version
            inst = ver.form_instance if ver else None
            results.append({
                "approval_instance_id": ai.id,
                "form_instance_id": inst.id if inst else None,
                "reference_number": inst.reference_number if inst else "—",
                "form_name": inst.form_definition.name if inst and inst.form_definition else "—",
                "step_label": ai.step_label,
                "status": ai.status.value,
                "signed_at": ai.signed_at
            })
        return results

    return {
        "pending": _format_ai(pending),
        "approved_by_me": _format_ai(approved),
        "rejected_by_me": _format_ai(rejected),
        "counts": {
            "pending": len(pending),
            "approved": len(approved),
            "rejected": len(rejected)
        }
    }


@router.get("/report-manager")
def report_manager_dashboard(
    current_user: User = Depends(require_roles(RoleName.report_manager, RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Department-scoped dashboard for Report Managers."""
    from models.organization import Department

    # Resolve the top-level department of the current user
    dept_id = current_user.department_id
    top_dept_id = None
    dept_name = None
    if dept_id:
        dept = db.query(Department).filter(Department.id == dept_id).first()
        if dept:
            top_dept_id = dept.parent_department_id or dept.id
            top_dept = db.query(Department).filter(Department.id == top_dept_id).first()
            dept_name = top_dept.name if top_dept else dept.name

    # Collect all dept-tree user IDs
    if top_dept_id:
        dept_ids = [
            d.id for d in db.query(Department).filter(
                (Department.id == top_dept_id) |
                (Department.parent_department_id == top_dept_id)
            ).all()
        ]
        dept_users = db.query(User).filter(
            User.organization_id == current_user.organization_id,
            User.department_id.in_(dept_ids)
        ).all()
    else:
        dept_users = []

    dept_user_ids = [u.id for u in dept_users]

    # Direct reports (users where manager/sn_manager/hod = current user)
    from sqlalchemy import or_
    direct_reports = db.query(User).filter(
        User.organization_id == current_user.organization_id,
        or_(
            User.manager_id == current_user.id,
            User.sn_manager_id == current_user.id,
            User.hod_id == current_user.id
        )
    ).all()
    direct_report_ids = [u.id for u in direct_reports]

    # Forms submitted by dept members
    dept_forms = db.query(FormInstance).filter(
        FormInstance.organization_id == current_user.organization_id,
        FormInstance.created_by.in_(dept_user_ids) if dept_user_ids else False
    ).order_by(FormInstance.created_at.desc()).all() if dept_user_ids else []

    by_status = {}
    for f in dept_forms:
        k = f.current_status.value
        by_status[k] = by_status.get(k, 0) + 1

    # Pending approvals for this manager
    from models.approval import ApprovalInstance, ApprovalStepStatus
    my_pending = db.query(ApprovalInstance).filter(
        ApprovalInstance.organization_id == current_user.organization_id,
        ApprovalInstance.approver_user_id == current_user.id,
        ApprovalInstance.status == ApprovalStepStatus.active
    ).all()

    return {
        "department_name": dept_name,
        "department_user_count": len(dept_users),
        "direct_report_count": len(direct_reports),
        "by_status": by_status,
        "total_dept_forms": len(dept_forms),
        "my_pending_count": len(my_pending),
        "recent_forms": [
            {
                "id": f.id,
                "reference_number": f.reference_number,
                "form_name": f.form_definition.name if f.form_definition else "—",
                "initiator": f.creator.name if f.creator else "—",
                "status": f.current_status.value,
                "submitted_at": f.submitted_at,
            }
            for f in dept_forms[:20]
        ],
        "direct_reports": [
            {"id": u.id, "name": u.name, "email": u.email}
            for u in direct_reports
        ]
    }


@router.get("/admin")
def admin_dashboard(
    status: str = None,
    department_id: str = None,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Admin view: all forms with filters, stats, correction cycles."""
    query = db.query(FormInstance).filter(
        FormInstance.organization_id == current_user.organization_id
    )
    if status:
        query = query.filter(FormInstance.current_status == status)

    all_forms = query.order_by(FormInstance.created_at.desc()).all()

    # Department filter
    if department_id:
        all_forms = [
            f for f in all_forms
            if f.creator and f.creator.department_id == department_id
        ]

    # Stats
    total = len(all_forms)
    by_status = {}
    for f in all_forms:
        k = f.current_status.value
        by_status[k] = by_status.get(k, 0) + 1

    # Correction cycle stats (forms with version > 1)
    multi_version = [f for f in all_forms if f.current_version > 1]

    # Recent audit activity
    recent_audit = db.query(AuditLog).filter(
        AuditLog.organization_id == current_user.organization_id
    ).order_by(AuditLog.timestamp.desc()).limit(20).all()

    return {
        "total_forms": total,
        "by_status": by_status,
        "correction_cycles": len(multi_version),
        "forms": [
            {
                "id": f.id,
                "reference_number": f.reference_number,
                "form_name": f.form_definition.name if f.form_definition else "—",
                "initiator": f.creator.name if f.creator else "—",
                "department": f.creator.department.name if f.creator and f.creator.department else "—",
                "status": f.current_status.value,
                "version": f.current_version,
                "submitted_at": f.submitted_at,
                "completed_at": f.completed_at
            }
            for f in all_forms[:50]  # cap at 50 for performance
        ],
        "recent_activity": [
            {
                "action": a.action,
                "entity_type": a.entity_type,
                "timestamp": a.timestamp,
                "user_id": a.user_id
            }
            for a in recent_audit
        ]
    }


@router.get("/logs")
def audit_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Paginated audit log for admins."""
    q = db.query(AuditLog).filter(
        AuditLog.organization_id == current_user.organization_id
    )
    if action:
        q = q.filter(AuditLog.action == action)

    total = q.count()
    logs = q.order_by(AuditLog.timestamp.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "logs": [
            {
                "id": a.id,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "user_name": a.user.name if a.user else "System",
                "user_email": a.user.email if a.user else None,
                "timestamp": a.timestamp,
                "details": a.details,
            }
            for a in logs
        ]
    }
