from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
from models.user import User, RoleName
from models.form import (
    FormDefinition, FormField, FormInstance, FormVersion,
    FormFieldValue, FormStatus
)
from models.approval import ApprovalTemplate
from schemas.form import (
    FormDefinitionCreate, FormDefinitionUpdate, FormDefinitionResponse,
    FormInstanceCreate, FormInstanceResponse, FormInstanceDetail,
    FormInstanceSubmit, FormVersionResponse, FormFieldCreate, DraftUpdateInput
)
from models.approval import ApprovalInstance, ApprovalStepStatus
from pydantic import BaseModel as _BaseModel
from typing import List as _List

class FieldsLayoutUpdate(_BaseModel):
    fields: _List[FormFieldCreate]
from core.security import get_current_active_user
from core.permissions import require_roles
from services import form_service, approval_service, audit_service
from services.email_service import send_approval_request_email
import os, shutil
from config import settings

router = APIRouter(prefix="/forms", tags=["Forms"])


# ── FORM DEFINITIONS ──────────────────────────────────────────────────────────

@router.post("/definitions", response_model=FormDefinitionResponse)
def create_form_definition(
    payload: FormDefinitionCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    form_def = FormDefinition(
        organization_id=current_user.organization_id,
        name=payload.name,
        description=payload.description,
        code_suffix=payload.code_suffix.upper(),
        visibility=payload.visibility,
        visible_department_ids=payload.visible_department_ids,
        allow_backdating=payload.allow_backdating,
        allow_attachments=payload.allow_attachments,
        approval_template_id=payload.approval_template_id,
        created_by=current_user.id
    )
    db.add(form_def)
    db.flush()

    for idx, field_data in enumerate(payload.fields):
        field = FormField(
            form_definition_id=form_def.id,
            field_name=field_data.field_name,
            field_label=field_data.field_label,
            field_type=field_data.field_type,
            required=field_data.required,
            auto_filled=field_data.auto_filled,
            auto_fill_source=field_data.auto_fill_source,
            calculation_enabled=field_data.calculation_enabled,
            calculation_formula=field_data.calculation_formula,
            options=field_data.options,
            placeholder=field_data.placeholder,
            display_order=field_data.display_order if field_data.display_order else idx
        )
        db.add(field)

    db.commit()
    db.refresh(form_def)
    audit_service.log_event(
        db, current_user.organization_id, "FORM_DEFINITION_CREATED",
        user_id=current_user.id, entity_type="FormDefinition", entity_id=form_def.id
    )
    return form_def


@router.get("/definitions", response_model=List[FormDefinitionResponse])
def list_form_definitions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    return db.query(FormDefinition).filter(
        FormDefinition.organization_id == current_user.organization_id,
        FormDefinition.is_active == True
    ).all()


@router.get("/definitions/{form_def_id}", response_model=FormDefinitionResponse)
def get_form_definition(
    form_def_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")
    return form_def


@router.patch("/definitions/{form_def_id}", response_model=FormDefinitionResponse)
def update_form_definition(
    form_def_id: str,
    payload: FormDefinitionUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")
    updates = payload.model_dump(exclude_none=True)
    if 'code_suffix' in updates:
        updates['code_suffix'] = updates['code_suffix'].upper()
    for field, value in updates.items():
        setattr(form_def, field, value)
    db.commit()
    db.refresh(form_def)
    return form_def


@router.delete("/definitions/{form_def_id}", status_code=204)
def delete_form_definition(
    form_def_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")

    # Cancel any active form instances and their pending approval steps
    active_instances = db.query(FormInstance).filter(
        FormInstance.form_definition_id == form_def_id,
        FormInstance.current_status.notin_([FormStatus.draft, FormStatus.rejected, FormStatus.approved, FormStatus.completed])
    ).all()
    for instance in active_instances:
        instance.current_status = FormStatus.rejected
        # Cancel pending approval steps linked to this instance's versions
        for version in instance.versions:
            for step in version.approval_instances:
                if step.status in (ApprovalStepStatus.waiting, ApprovalStepStatus.active):
                    step.status = ApprovalStepStatus.rejected
                    step.notes = "Cancelled by administrator (form type deleted)"

    form_def.is_active = False
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "FORM_DEFINITION_DELETED",
        user_id=current_user.id, entity_type="FormDefinition", entity_id=form_def_id,
        details={"cancelled_instances": len(active_instances)}
    )


# ── PDF TEMPLATE ──────────────────────────────────────────────────────────────

@router.post("/definitions/{form_def_id}/pdf-template")
async def upload_pdf_template(
    form_def_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF")

    pdf_dir = os.path.join(settings.MEDIA_DIR, "pdf_templates", current_user.organization_id)
    os.makedirs(pdf_dir, exist_ok=True)
    stored_path = os.path.join(pdf_dir, f"{form_def_id}.pdf")

    with open(stored_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    form_def.pdf_template_path = stored_path
    db.commit()
    return {"message": "PDF template uploaded successfully"}


@router.get("/definitions/{form_def_id}/pdf-template")
def get_pdf_template(
    form_def_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")
    if not form_def.pdf_template_path or not os.path.exists(form_def.pdf_template_path):
        raise HTTPException(status_code=404, detail="No PDF template uploaded for this form")
    return FileResponse(
        path=form_def.pdf_template_path,
        media_type="application/pdf",
        filename=f"{form_def.name.replace(' ', '_')}_template.pdf"
    )


@router.put("/definitions/{form_def_id}/fields")
def update_form_fields_layout(
    form_def_id: str,
    payload: FieldsLayoutUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Replace the field layout for a form definition (upsert by ID, soft-delete removed)."""
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")

    existing = db.query(FormField).filter(
        FormField.form_definition_id == form_def_id
    ).all()
    existing_map = {f.id: f for f in existing}
    incoming_ids = {f.id for f in payload.fields if f.id}

    # Soft-delete fields not in the new layout
    for fid, field in existing_map.items():
        if fid not in incoming_ids:
            field.is_active = False

    # Upsert each field
    for idx, fd in enumerate(payload.fields):
        if fd.id and fd.id in existing_map:
            f = existing_map[fd.id]
            f.field_name = fd.field_name
            f.field_label = fd.field_label
            f.field_type = fd.field_type
            f.required = fd.required
            f.auto_filled = fd.auto_filled
            f.auto_fill_source = fd.auto_fill_source
            f.options = fd.options
            f.placeholder = fd.placeholder
            f.display_order = idx
            f.default_value = fd.default_value
            f.read_only = fd.read_only
            f.validation_rules = fd.validation_rules
            f.calculation_formula = fd.calculation_formula
            f.table_columns = fd.table_columns
            f.page_number = fd.page_number
            f.x_pct = fd.x_pct
            f.y_pct = fd.y_pct
            f.width_pct = fd.width_pct
            f.height_pct = fd.height_pct
            f.filled_by = fd.filled_by or 'initiator'
            f.is_active = True
        else:
            new_field = FormField(
                form_definition_id=form_def_id,
                field_name=fd.field_name,
                field_label=fd.field_label,
                field_type=fd.field_type,
                required=fd.required,
                auto_filled=fd.auto_filled,
                options=fd.options,
                placeholder=fd.placeholder,
                display_order=idx,
                default_value=fd.default_value,
                read_only=fd.read_only,
                validation_rules=fd.validation_rules,
                calculation_formula=fd.calculation_formula,
                table_columns=fd.table_columns,
                page_number=fd.page_number,
                x_pct=fd.x_pct,
                y_pct=fd.y_pct,
                width_pct=fd.width_pct,
                height_pct=fd.height_pct,
                filled_by=fd.filled_by or 'initiator',
            )
            db.add(new_field)

    db.commit()
    db.refresh(form_def)
    return form_def


# ── FORM INSTANCES ────────────────────────────────────────────────────────────

@router.post("/instances", response_model=FormInstanceResponse)
def create_form_instance(
    payload: FormInstanceCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        instance = form_service.create_form_instance(
            db=db,
            organization_id=current_user.organization_id,
            form_definition_id=payload.form_definition_id,
            created_by_user=current_user,
            field_values=[fv.model_dump() for fv in payload.field_values],
            backdated_date=payload.backdated_date
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    audit_service.log_event(
        db, current_user.organization_id, "FORM_DRAFT_CREATED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=instance.id
    )
    return instance


@router.get("/instances", response_model=List[FormInstanceResponse])
def list_form_instances(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    query = db.query(FormInstance).filter(
        FormInstance.organization_id == current_user.organization_id
    )
    if RoleName.admin not in role_names:
        query = query.filter(FormInstance.created_by == current_user.id)
    if status:
        query = query.filter(FormInstance.current_status == status)
    instances = query.order_by(FormInstance.created_at.desc()).all()

    results = []
    for inst in instances:
        d = FormInstanceResponse.model_validate(inst)
        # Attach form name
        d.form_name = inst.form_definition.name if inst.form_definition else None
        # Compute approval progress from the latest version
        version = next(
            (v for v in inst.versions if v.version_number == inst.current_version), None
        )
        if version and version.approval_instances:
            ais = sorted(version.approval_instances, key=lambda a: a.step_order)
            total = len(ais)
            active = next((a for a in ais if a.status == ApprovalStepStatus.active), None)
            completed = sum(1 for a in ais if a.status == ApprovalStepStatus.approved)
            d.approval_progress = {
                "total_steps": total,
                "completed_steps": completed,
                "active_step_order": active.step_order if active else None,
                "active_step_label": active.step_label if active else None,
                "active_approver": active.approver.name if active and active.approver else None,
            }
        results.append(d)
    return results


@router.patch("/instances/{instance_id}/draft")
def save_draft(
    instance_id: str,
    payload: DraftUpdateInput,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update field values of a Draft instance without submitting."""
    instance = db.query(FormInstance).filter(
        FormInstance.id == instance_id,
        FormInstance.organization_id == current_user.organization_id,
        FormInstance.created_by == current_user.id,
        FormInstance.current_status == FormStatus.draft
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Draft not found or already submitted")

    version = next(
        (v for v in instance.versions if v.version_number == instance.current_version), None
    )
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    for fv_input in payload.field_values:
        existing = db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == version.id,
            FormFieldValue.form_field_id == fv_input.form_field_id
        ).first()
        if existing:
            existing.value = fv_input.value
        else:
            db.add(FormFieldValue(
                form_version_id=version.id,
                form_field_id=fv_input.form_field_id,
                value=fv_input.value
            ))
    db.commit()
    return {"message": "Draft saved"}


@router.get("/instances/{instance_id}")
def get_form_instance(
    instance_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    instance = db.query(FormInstance).filter(
        FormInstance.id == instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found")
    return instance


@router.post("/instances/{instance_id}/submit")
def submit_form_instance(
    instance_id: str,
    payload: FormInstanceSubmit,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    instance = db.query(FormInstance).filter(
        FormInstance.id == instance_id,
        FormInstance.organization_id == current_user.organization_id,
        FormInstance.created_by == current_user.id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found or not yours")

    try:
        instance = form_service.submit_form(
            db, instance, current_user,
            [fv.model_dump() for fv in payload.field_values],
            payload.change_notes
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Get current version
    current_ver = db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()

    if current_ver:
        ap_instances = approval_service.initialize_approval_steps(
            db, current_ver, instance, current_user,
            payload.selected_approver_ids
        )

        # Notify first active approver
        first_active = next(
            (ai for ai in ap_instances if ai.status.value == "Active" and ai.approver_user_id),
            None
        )
        if first_active and first_active.approver:
            try:
                send_approval_request_email(
                    to_email=first_active.approver.email,
                    approver_name=first_active.approver.name,
                    initiator_name=current_user.name,
                    form_name=instance.form_definition.name if instance.form_definition else "Form",
                    reference_number=instance.reference_number,
                    step_label=first_active.step_label or "Approval Step",
                    form_instance_id=instance.id
                )
            except Exception as e:
                print(f"[EMAIL WARNING] {e}")

    audit_service.log_event(
        db, current_user.organization_id, "FORM_SUBMITTED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=instance.id
    )
    return {"message": "Form submitted successfully", "status": instance.current_status}


@router.post("/instances/{instance_id}/resubmit")
def resubmit_form_instance(
    instance_id: str,
    payload: FormInstanceSubmit,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Resubmit after correction (creates new version)."""
    instance = db.query(FormInstance).filter(
        FormInstance.id == instance_id,
        FormInstance.organization_id == current_user.organization_id,
        FormInstance.created_by == current_user.id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found or not yours")
    if instance.current_status != FormStatus.returned_for_correction:
        raise HTTPException(status_code=400, detail="Form is not in correction state")

    # Submit with field value updates
    try:
        instance = form_service.submit_form(
            db, instance, current_user,
            [fv.model_dump() for fv in payload.field_values],
            payload.change_notes
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Restart approval
    current_ver = db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()

    if current_ver:
        approval_service.initialize_approval_steps(
            db, current_ver, instance, current_user,
            payload.selected_approver_ids
        )

    audit_service.log_event(
        db, current_user.organization_id, "FORM_RESUBMITTED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=instance.id,
        details={"new_version": instance.current_version}
    )
    return {"message": "Form resubmitted", "version": instance.current_version}


@router.post("/instances/{instance_id}/attachments")
async def upload_attachment(
    instance_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    instance = db.query(FormInstance).filter(
        FormInstance.id == instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found")

    # Only the form owner (or admin) may upload attachments
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    is_admin = "Admin" in role_names
    if instance.created_by != current_user.id and not is_admin:
        raise HTTPException(status_code=403, detail="Only the form owner can upload attachments")

    # Block uploads on completed/rejected forms
    terminal_statuses = [FormStatus.completed, FormStatus.rejected]
    if instance.current_status in terminal_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot add attachments to a {instance.current_status.value} form"
        )

    from models.form import FormAttachment
    import uuid

    after_submission = instance.current_status != FormStatus.draft

    attach_dir = os.path.join(settings.MEDIA_DIR, "attachments", current_user.organization_id)
    os.makedirs(attach_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(attach_dir, stored_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    attachment = FormAttachment(
        organization_id=current_user.organization_id,
        form_instance_id=instance.id,
        original_filename=file.filename,
        stored_filename=stored_name,
        file_size=os.path.getsize(file_path),
        content_type=file.content_type,
        uploaded_by=current_user.id,
        uploaded_after_submission=after_submission
    )
    db.add(attachment)
    db.commit()

    audit_service.log_event(
        db, current_user.organization_id,
        "ATTACHMENT_ADDED_AFTER_SUBMISSION" if after_submission else "ATTACHMENT_UPLOADED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=instance.id,
        details={"filename": file.filename, "after_submission": after_submission}
    )

    return {
        "message": "Attachment uploaded",
        "filename": file.filename,
        "uploaded_after_submission": after_submission
    }


# ── APPROVAL TEMPLATES ────────────────────────────────────────────────────────

templates_router = APIRouter(prefix="/approval-templates", tags=["Approval Templates"])

from schemas.approval import (
    ApprovalTemplateCreate, ApprovalTemplateUpdate, ApprovalTemplateResponse
)
from models.approval import ApprovalTemplate, ApprovalTemplateStep, ApprovalTemplateCCRecipient


@templates_router.post("", response_model=ApprovalTemplateResponse)
def create_template(
    payload: ApprovalTemplateCreate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    template = ApprovalTemplate(
        organization_id=current_user.organization_id,
        name=payload.name,
        description=payload.description,
        restart_on_correction=payload.restart_on_correction,
        created_by=current_user.id
    )
    db.add(template)
    db.flush()

    for step_data in payload.steps:
        step = ApprovalTemplateStep(
            template_id=template.id,
            step_order=step_data.step_order,
            step_label=step_data.step_label,
            role_type=step_data.role_type,
            role_id=step_data.role_id,
            specific_user_id=step_data.specific_user_id,
            hierarchy_level=step_data.hierarchy_level,
            skip_if_missing=step_data.skip_if_missing,
            delegation_allowed=step_data.delegation_allowed
        )
        db.add(step)

    for cc_data in payload.cc_recipients:
        db.add(ApprovalTemplateCCRecipient(
            template_id=template.id,
            role_type=cc_data.role_type,
            role_id=cc_data.role_id,
            specific_user_id=cc_data.specific_user_id,
            hierarchy_level=cc_data.hierarchy_level,
            label=cc_data.label
        ))

    db.commit()
    db.refresh(template)
    audit_service.log_event(
        db, current_user.organization_id, "APPROVAL_TEMPLATE_CREATED",
        user_id=current_user.id, entity_type="ApprovalTemplate", entity_id=template.id
    )
    return template


@templates_router.get("", response_model=List[ApprovalTemplateResponse])
def list_templates(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    return db.query(ApprovalTemplate).filter(
        ApprovalTemplate.organization_id == current_user.organization_id,
        ApprovalTemplate.is_active == True
    ).all()


@templates_router.get("/{template_id}", response_model=ApprovalTemplateResponse)
def get_template(
    template_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    template = db.query(ApprovalTemplate).filter(
        ApprovalTemplate.id == template_id,
        ApprovalTemplate.organization_id == current_user.organization_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@templates_router.patch("/{template_id}", response_model=ApprovalTemplateResponse)
def update_template(
    template_id: str,
    payload: ApprovalTemplateUpdate,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    template = db.query(ApprovalTemplate).filter(
        ApprovalTemplate.id == template_id,
        ApprovalTemplate.organization_id == current_user.organization_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = payload.model_dump(exclude_none=True, exclude={"steps", "cc_recipients"})
    for field, value in update_data.items():
        setattr(template, field, value)

    if payload.steps is not None:
        db.query(ApprovalTemplateStep).filter(
            ApprovalTemplateStep.template_id == template_id
        ).delete()
        for step_data in payload.steps:
            db.add(ApprovalTemplateStep(
                template_id=template.id,
                step_order=step_data.step_order,
                step_label=step_data.step_label,
                role_type=step_data.role_type,
                role_id=step_data.role_id,
                specific_user_id=step_data.specific_user_id,
                hierarchy_level=step_data.hierarchy_level,
                skip_if_missing=step_data.skip_if_missing,
                delegation_allowed=step_data.delegation_allowed
            ))

    if payload.cc_recipients is not None:
        db.query(ApprovalTemplateCCRecipient).filter(
            ApprovalTemplateCCRecipient.template_id == template_id
        ).delete()
        for cc_data in payload.cc_recipients:
            db.add(ApprovalTemplateCCRecipient(
                template_id=template.id,
                role_type=cc_data.role_type,
                role_id=cc_data.role_id,
                specific_user_id=cc_data.specific_user_id,
                hierarchy_level=cc_data.hierarchy_level,
                label=cc_data.label
            ))

    db.commit()
    db.refresh(template)
    audit_service.log_event(
        db, current_user.organization_id, "APPROVAL_TEMPLATE_UPDATED",
        user_id=current_user.id, entity_type="ApprovalTemplate", entity_id=template.id
    )
    return template


@templates_router.delete("/{template_id}", status_code=204)
def delete_template(
    template_id: str,
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    template = db.query(ApprovalTemplate).filter(
        ApprovalTemplate.id == template_id,
        ApprovalTemplate.organization_id == current_user.organization_id
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    template.is_active = False
    db.commit()
    audit_service.log_event(
        db, current_user.organization_id, "APPROVAL_TEMPLATE_DELETED",
        user_id=current_user.id, entity_type="ApprovalTemplate", entity_id=template.id
    )
