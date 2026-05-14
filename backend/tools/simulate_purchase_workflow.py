import json
import os
from datetime import datetime

import models.organization
import models.user
import models.form
import models.approval
import models.document
import models.audit
import models.delegation

from database import SessionLocal
from config import settings
from models.approval import ApprovalInstance, ApprovalStepStatus, ApprovalTemplateCCRecipient, RoleType
from models.document import DocumentShare, Signature, SignatureType
from models.form import FormAttachment, FormDefinition, FormFieldValue, FormInstance, FormVersion
from models.user import User, UserRole
from services import approval_service, document_service, form_service


def current_version(db, instance):
    return db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version,
    ).first()


def share_document(db, instance, gen_doc, org_id):
    seen_user_ids = set()

    def add_share(user_id, reason):
        if user_id and user_id not in seen_user_ids:
            seen_user_ids.add(user_id)
            db.add(DocumentShare(
                document_id=gen_doc.id,
                organization_id=org_id,
                user_id=user_id,
                share_reason=reason,
            ))

    add_share(instance.created_by, "initiator")

    final_ver = current_version(db, instance)
    approved_steps = db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == final_ver.id,
        ApprovalInstance.status == ApprovalStepStatus.approved,
    ).order_by(ApprovalInstance.step_order).all()
    for step in approved_steps:
        add_share(step.approver_user_id, "approver")

    template_id = instance.form_definition.approval_template_id if instance.form_definition else None
    if template_id:
        for cc in db.query(ApprovalTemplateCCRecipient).filter(
            ApprovalTemplateCCRecipient.template_id == template_id
        ).all():
            uid = None
            initiator = instance.creator
            if cc.role_type == RoleType.specific_user:
                uid = cc.specific_user_id
            elif cc.role_type == RoleType.hierarchy:
                uid = {
                    "manager": initiator.manager_id,
                    "sn_manager": initiator.sn_manager_id,
                    "hod": initiator.hod_id,
                }.get(cc.hierarchy_level)
            elif cc.role_type in (RoleType.functional, RoleType.executive) and cc.role_id:
                ur = db.query(UserRole).filter(UserRole.role_id == cc.role_id).first()
                uid = ur.user_id if ur else None
            add_share(uid, "cc")

    db.commit()


def main():
    db = SessionLocal()
    report = {
        "started_at": datetime.utcnow().isoformat() + "Z",
        "checks": [],
        "approval_steps": [],
        "document_access": [],
        "warnings": [],
    }
    try:
        william = db.query(User).filter(User.email == "william.manzi@bsc.rw").first()
        if not william:
            raise RuntimeError("William Manzi user was not found")
        form_def = db.query(FormDefinition).filter(
            FormDefinition.name == "Purchase Requisition",
            FormDefinition.organization_id == william.organization_id,
            FormDefinition.is_active == True,
        ).first()
        if not form_def:
            raise RuntimeError("Purchase Requisition form definition was not found")

        fields = {f.field_name: f for f in form_def.fields if f.is_active}
        values_by_name = {
            "description": "Simulation: 10 ergonomic office chairs for HR onboarding room",
            "quantity": "10",
            "estimated_cost": "1750000",
            "supplier": "Kigali Office Supplies Ltd",
            "justification": "Support onboarding sessions and replace worn seating",
            "budget_code": "CORP-HR-OPEX-2026",
            "finance_approval": "Budget line verified during workflow simulation.",
        }
        field_values = [
            {"form_field_id": fields[name].id, "value": value}
            for name, value in values_by_name.items()
            if name in fields
        ]

        instance = form_service.create_form_instance(
            db=db,
            organization_id=william.organization_id,
            form_definition_id=form_def.id,
            created_by_user=william,
            field_values=field_values,
        )
        report["checks"].append(f"Created draft {instance.reference_number} for {william.email}")

        attach_dir = os.path.join(settings.MEDIA_DIR, "attachments", william.organization_id)
        os.makedirs(attach_dir, exist_ok=True)
        stored_name = f"simulation_{instance.id}_quotation.txt"
        attach_path = os.path.join(attach_dir, stored_name)
        with open(attach_path, "w", encoding="utf-8") as f:
            f.write("Supplier quotation placeholder for FlowDesk purchase workflow simulation.\n")
            f.write(f"Reference: {instance.reference_number}\n")
            f.write("Amount: RWF 1,750,000\n")
        db.add(FormAttachment(
            organization_id=william.organization_id,
            form_instance_id=instance.id,
            original_filename="quotation_simulation.txt",
            stored_filename=stored_name,
            file_size=os.path.getsize(attach_path),
            content_type="text/plain",
            uploaded_by=william.id,
            uploaded_after_submission=False,
        ))
        db.commit()
        report["checks"].append("Uploaded one draft attachment: quotation_simulation.txt")

        instance = form_service.submit_form(db, instance, william, field_values, "Simulation submission")
        version = current_version(db, instance)
        approval_service.initialize_approval_steps(db, version, instance, william)
        db.refresh(instance)
        report["checks"].append(f"Submitted form; status is {instance.current_status.value}")

        while True:
            active = db.query(ApprovalInstance).filter(
                ApprovalInstance.form_version_id == version.id,
                ApprovalInstance.status == ApprovalStepStatus.active,
            ).order_by(ApprovalInstance.step_order).first()
            if not active:
                break

            approver = active.approver
            sig = Signature(
                organization_id=william.organization_id,
                approval_instance_id=active.id,
                user_id=approver.id,
                signature_type=SignatureType.canvas,
                signature_data=f"simulation-signature:{approver.email}",
            )
            db.add(sig)
            db.flush()
            all_done = approval_service.approve_step(
                db,
                active,
                approver,
                notes=f"Simulation approval by {approver.name}",
                signature_id=sig.id,
            )
            report["approval_steps"].append({
                "order": active.step_order,
                "label": active.step_label,
                "approver": approver.name,
                "email": approver.email,
                "all_done_after_step": all_done,
            })
            if all_done:
                break

        db.refresh(instance)
        pdf_bytes = document_service.generate_final_pdf(
            db, instance, organization_name=instance.creator.organization.name
        )
        final_approver = db.query(User).filter(
            User.email == report["approval_steps"][-1]["email"]
        ).first()
        gen_doc = document_service.save_generated_document(
            db, instance, pdf_bytes, william.organization_id, final_approver.id if final_approver else None
        )
        share_document(db, instance, gen_doc, william.organization_id)
        db.refresh(instance)

        shares = db.query(DocumentShare).filter(DocumentShare.document_id == gen_doc.id).all()
        for share in shares:
            report["document_access"].append({
                "name": share.user.name,
                "email": share.user.email,
                "reason": share.share_reason,
                "can_list_document": True,
            })

        report.update({
            "form_instance_id": instance.id,
            "reference_number": instance.reference_number,
            "final_status": instance.current_status.value,
            "attachment_count": len(instance.attachments),
            "generated_document": {
                "id": gen_doc.id,
                "file_name": gen_doc.file_name,
                "file_path": gen_doc.file_path,
                "file_size": gen_doc.file_size,
                "exists": os.path.exists(gen_doc.file_path),
            },
            "completed_at": datetime.utcnow().isoformat() + "Z",
        })

        expected_emails = {william.email}
        expected_emails.update(step["email"] for step in report["approval_steps"])
        shared_emails = {share.user.email for share in shares}
        missing_emails = sorted(expected_emails - shared_emails)
        if missing_emails:
            report["warnings"].append(f"Missing document shares for: {', '.join(missing_emails)}")

        print(json.dumps(report, indent=2, default=str))
    finally:
        db.close()


if __name__ == "__main__":
    main()
