from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from database import get_db
from models.user import User, RoleName, UserRole, Role
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
from services.event_bus import bus as event_bus
import os, shutil, logging
from config import settings

router = APIRouter(prefix="/forms", tags=["Forms"])
logger = logging.getLogger(__name__)


def _publish_workflow(org_id: str, action: str, form_instance_id: str, actor_id: str) -> None:
    """Fire-and-forget workflow event for SSE subscribers."""
    try:
        event_bus.publish(org_id, {
            "type": "workflow.changed",
            "action": action,
            "form_instance_id": form_instance_id,
            "actor_id": actor_id,
        })
    except Exception as e:
        logger.warning("[EVENT] publish failed: %s", e)


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
        section_layouts=payload.section_layouts or {},
        created_by=current_user.id
    )
    db.add(form_def)
    db.flush()

    if payload.initiator_role_ids:
        roles = db.query(Role).filter(
            Role.id.in_(payload.initiator_role_ids),
            Role.organization_id == current_user.organization_id
        ).all()
        form_def.initiator_roles = roles

    if payload.initiator_user_ids:
        users = db.query(User).filter(
            User.id.in_(payload.initiator_user_ids),
            User.organization_id == current_user.organization_id
        ).all()
        form_def.initiator_users = users

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
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    is_admin = RoleName.admin in role_names

    forms = db.query(FormDefinition).filter(
        FormDefinition.organization_id == current_user.organization_id,
        FormDefinition.is_active == True
    ).all()

    if is_admin:
        return forms

    user_role_ids = {ur.role_id for ur in current_user.user_roles}
    visible = []
    for f in forms:
        allowed_role_ids = {r.id for r in f.initiator_roles}
        allowed_user_ids = {u.id for u in f.initiator_users}
        # If neither roles nor users are listed, the form is open to all.
        # Otherwise the user must match either an allowed role or be
        # listed explicitly as an allowed user.
        if not allowed_role_ids and not allowed_user_ids:
            visible.append(f)
        elif (allowed_role_ids & user_role_ids) or (current_user.id in allowed_user_ids):
            visible.append(f)
    return visible


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
    updates = payload.model_dump(exclude_unset=True)
    initiator_role_ids = updates.pop('initiator_role_ids', None)
    initiator_user_ids = updates.pop('initiator_user_ids', None)

    if 'code_suffix' in updates and updates['code_suffix']:
        updates['code_suffix'] = updates['code_suffix'].upper()
    for field, value in updates.items():
        setattr(form_def, field, value)

    if initiator_role_ids is not None:
        if initiator_role_ids:
            roles = db.query(Role).filter(
                Role.id.in_(initiator_role_ids),
                Role.organization_id == current_user.organization_id
            ).all()
            form_def.initiator_roles = roles
        else:
            form_def.initiator_roles = []

    if initiator_user_ids is not None:
        if initiator_user_ids:
            users = db.query(User).filter(
                User.id.in_(initiator_user_ids),
                User.organization_id == current_user.organization_id
            ).all()
            form_def.initiator_users = users
        else:
            form_def.initiator_users = []

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

    # Read with a hard size cap, then verify the real PDF magic bytes — don't
    # trust the client-declared content type.
    max_bytes = settings.MAX_UPLOAD_SIZE_BYTES
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit",
        )
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

    pdf_dir = os.path.join(settings.MEDIA_DIR, "pdf_templates", current_user.organization_id)
    os.makedirs(pdf_dir, exist_ok=True)
    # Stored name is derived from the DB-validated form_def_id, not user input.
    stored_path = os.path.join(pdf_dir, f"{form_def_id}.pdf")

    with open(stored_path, "wb") as f:
        f.write(data)

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


@router.post("/definitions/{form_def_id}/pdf-template/page/{page_num}")
async def upload_pdf_template_page(
    form_def_id: str,
    page_num: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db)
):
    """Upload a separate PDF template for a specific form page (page_num >= 1).
    Page 1 also updates the main pdf_template_path for backwards compatibility.
    """
    if page_num < 1:
        raise HTTPException(status_code=400, detail="page_num must be >= 1")
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a PDF")

    max_bytes = settings.MAX_UPLOAD_SIZE_BYTES
    data = file.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit",
        )
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid PDF")

    pdf_dir = os.path.join(settings.MEDIA_DIR, "pdf_templates", current_user.organization_id)
    os.makedirs(pdf_dir, exist_ok=True)

    # page_num is an int path param and form_def_id is DB-validated above, so
    # the stored filename is never attacker-controlled.
    if page_num == 1:
        stored_path = os.path.join(pdf_dir, f"{form_def_id}.pdf")
        form_def.pdf_template_path = stored_path
    else:
        stored_path = os.path.join(pdf_dir, f"{form_def_id}_p{page_num}.pdf")

    with open(stored_path, "wb") as f:
        f.write(data)

    db.commit()
    return {"message": f"PDF template for page {page_num} uploaded successfully", "page": page_num}


@router.get("/definitions/{form_def_id}/pdf-template/page/{page_num}")
def get_pdf_template_page(
    form_def_id: str,
    page_num: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get the PDF template for a specific form page. Falls back to page 1 template if not found."""
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_def_id,
        FormDefinition.organization_id == current_user.organization_id
    ).first()
    if not form_def:
        raise HTTPException(status_code=404, detail="Form definition not found")

    if page_num == 1:
        path = form_def.pdf_template_path
    else:
        pdf_dir = os.path.join(settings.MEDIA_DIR, "pdf_templates", current_user.organization_id)
        path = os.path.join(pdf_dir, f"{form_def_id}_p{page_num}.pdf")

    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"No PDF template for page {page_num}")

    return FileResponse(
        path=path,
        media_type="application/pdf",
        filename=f"{form_def.name.replace(' ', '_')}_p{page_num}_template.pdf"
    )


@router.put("/definitions/{form_def_id}/fields", response_model=FormDefinitionResponse)
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
            f.section_name = fd.section_name
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
            f.grid_width = fd.grid_width
            f.free_position = bool(fd.free_position)
            f.filled_by = fd.filled_by or 'initiator'
            f.is_active = True
        else:
            new_field = FormField(
                form_definition_id=form_def_id,
                field_name=fd.field_name,
                field_label=fd.field_label,
                field_type=fd.field_type,
                section_name=fd.section_name,
                grid_width=fd.grid_width,
                free_position=bool(fd.free_position),
                required=fd.required,
                auto_filled=fd.auto_filled,
                auto_fill_source=fd.auto_fill_source,
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
    # Touch the relationship so the response serializer can iterate it after refresh
    _ = list(form_def.fields)
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
    scope: Optional[str] = Query(None, regex="^(mine|org)$"),
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List form instances for the dashboard / My Forms views.

    `scope=mine` (default) — only forms the current user initiated. Non-admins
    are always pinned to this scope regardless of what they pass.
    `scope=org` — every form in the organization. Admin-only; non-admins
    asking for `org` are silently downgraded to `mine`.

    Optional filters:
    - `status` — exact FormStatus value (e.g. `Pending`, `Approved`).
    - `date_from` / `date_to` — ISO date strings (yyyy-MM-dd). Filters on
      submitted_at when present, otherwise created_at, so drafts also
      respect the range.
    - `search` — whitespace-split tokens; every token must appear in the
      concatenation of reference_number + form_name + initiator name/email.
    """
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    is_admin = RoleName.admin in role_names

    # Resolve effective scope. Non-admins are pinned to "mine"; admin defaults
    # to "mine" too unless they explicitly opt into the org-wide view.
    effective_scope = "org" if (is_admin and scope == "org") else "mine"

    query = db.query(FormInstance).filter(
        FormInstance.organization_id == current_user.organization_id
    )
    if effective_scope == "mine":
        query = query.filter(FormInstance.created_by == current_user.id)
    if status:
        query = query.filter(FormInstance.current_status == status)

    # Date range. submitted_at preferred (the canonical "when did this go
    # into the chain" date) with created_at as the fallback for drafts.
    def _parse_iso_date(s: str):
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None

    if date_from:
        df = _parse_iso_date(date_from)
        if df:
            query = query.filter(
                func.coalesce(FormInstance.submitted_at, FormInstance.created_at) >= df
            )
    if date_to:
        dt = _parse_iso_date(date_to)
        if dt:
            # Inclusive end-of-day so the user picking "to 2026-05-18"
            # captures anything that day.
            dt_end = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            query = query.filter(
                func.coalesce(FormInstance.submitted_at, FormInstance.created_at) <= dt_end
            )

    instances = query.order_by(FormInstance.created_at.desc()).all()

    # Token-based search applied in Python (search hits form_name and
    # initiator details that aren't direct FormInstance columns). Token
    # match: every token must appear in the haystack.
    if search and search.strip():
        tokens = [t for t in search.lower().split() if t]
        if tokens:
            filtered = []
            for inst in instances:
                hay_parts = [
                    inst.reference_number or "",
                    inst.form_definition.name if inst.form_definition else "",
                    inst.creator.name if inst.creator else "",
                    inst.creator.email if inst.creator else "",
                ]
                hay = " ".join(hay_parts).lower()
                if all(t in hay for t in tokens):
                    filtered.append(inst)
            instances = filtered

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


@router.get("/instances/{instance_id}", response_model=FormInstanceDetail)
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

    # Org membership is not enough — a form's field values can be sensitive.
    # Allow only the initiator, an assigned approver on any version, or admin.
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    if RoleName.admin not in role_names and instance.created_by != current_user.id:
        is_approver = db.query(ApprovalInstance.id).join(
            FormVersion, ApprovalInstance.form_version_id == FormVersion.id
        ).filter(
            FormVersion.form_instance_id == instance.id,
            ApprovalInstance.approver_user_id == current_user.id,
        ).first()
        if not is_approver:
            raise HTTPException(status_code=404, detail="Form instance not found")
    # Touch every lazy-loaded relationship the response_model references so
    # Pydantic's from_attributes conversion finds them populated. Without
    # these touches the relationship attribute is a fresh AppenderQuery /
    # InstrumentedList that gets serialised as empty.
    _ = instance.creator
    _ = list(instance.attachments)
    _ = list(instance.versions)
    for v in instance.versions:
        _ = v.schema_snapshot   # snapshot is a JSON column, no relationship to touch but explicit access keeps it loaded
        _ = list(v.field_values)
        for fv in v.field_values:
            _ = fv.form_field
        _ = list(v.approval_instances)
        for ai in v.approval_instances:
            _ = ai.approver
            _ = ai.delegated_from
            _ = ai.signature  # eager-load so SignatureBrief serializes
    if instance.form_definition:
        _ = list(instance.form_definition.fields)
    return instance


@router.get("/instances/{instance_id}/pdf")
def export_form_pdf(
    instance_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Render a fully-merged PDF for an approved/completed form instance.
    Includes the org letterhead, all field values, the approval history,
    image attachments as full pages, and PDF attachments appended at the
    end. Office docs are listed but not yet inlined (Phase E.2.b)."""
    instance = db.query(FormInstance).filter(
        FormInstance.id == instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found")

    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]
    if RoleName.admin not in role_names and instance.created_by != current_user.id:
        is_approver = db.query(ApprovalInstance.id).join(
            FormVersion, ApprovalInstance.form_version_id == FormVersion.id
        ).filter(
            FormVersion.form_instance_id == instance.id,
            ApprovalInstance.approver_user_id == current_user.id,
        ).first()
        if not is_approver:
            raise HTTPException(status_code=404, detail="Form instance not found")

    if instance.current_status not in (FormStatus.approved, FormStatus.completed):
        raise HTTPException(
            status_code=400,
            detail=(
                f"PDF export is only available once the form is approved. "
                f"Current status: {instance.current_status.value}"
            )
        )

    # Touch every relationship the generator reads so SA loads them while the
    # session is still open.
    _ = instance.creator
    _ = list(instance.attachments)
    _ = list(instance.versions)
    for v in instance.versions:
        _ = list(v.field_values)
        for fv in v.field_values:
            _ = fv.form_field
        _ = list(v.approval_instances)
        for ai in v.approval_instances:
            _ = ai.approver
            _ = ai.signature
    if instance.form_definition:
        _ = list(instance.form_definition.fields)

    from services.pdf_service import generate_form_pdf
    from fastapi.responses import Response
    pdf_bytes = generate_form_pdf(db, instance)

    audit_service.log_event(
        db, current_user.organization_id, "FORM_PDF_EXPORTED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=instance.id
    )

    safe_ref = (instance.reference_number or instance_id).replace('/', '_')
    return Response(
        content=pdf_bytes,
        media_type='application/pdf',
        headers={
            'Content-Disposition': f'attachment; filename="{safe_ref}.pdf"',
            'Cache-Control': 'no-store',
        }
    )


@router.get("/attachments/{attachment_id}")
def download_attachment(
    attachment_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    from models.form import FormAttachment
    attachment = db.query(FormAttachment).filter(
        FormAttachment.id == attachment_id,
        FormAttachment.organization_id == current_user.organization_id
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    file_path = os.path.join(
        settings.MEDIA_DIR, "attachments",
        attachment.organization_id, attachment.stored_filename
    )
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(
        file_path,
        filename=attachment.original_filename,
        media_type=attachment.content_type or "application/octet-stream"
    )


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

    # An initiator must never be an approver on their own form (self-approval).
    if payload.selected_approver_ids and current_user.id in payload.selected_approver_ids.values():
        raise HTTPException(status_code=400, detail="You cannot select yourself as an approver of your own form")

    # Initiator must sign at submit time. Backdating is allowed -- the chosen
    # date is captured on instance.initiator_signed_at.
    if not payload.initiator_signature_data:
        raise HTTPException(
            status_code=400,
            detail="Your signature is required to submit this form."
        )
    instance.initiator_signature_data = payload.initiator_signature_data
    instance.initiator_signed_at = payload.initiator_signed_at or datetime.utcnow()

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
        # Defensive: same cleanup as /resubmit. /submit accepts both Draft
        # and Returned-for-Correction (legacy), so a Returned-form submit
        # could land here and double up the chain otherwise.
        existing = db.query(ApprovalInstance).filter(
            ApprovalInstance.form_version_id == current_ver.id
        ).all()
        for ai in existing:
            db.delete(ai)
        if existing:
            db.flush()
        try:
            ap_instances = approval_service.initialize_approval_steps(
                db, current_ver, instance, current_user,
                payload.selected_approver_ids
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

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
    _publish_workflow(current_user.organization_id, "submitted", instance.id, current_user.id)
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

    # An initiator must never be an approver on their own form (self-approval).
    if payload.selected_approver_ids and current_user.id in payload.selected_approver_ids.values():
        raise HTTPException(status_code=400, detail="You cannot select yourself as an approver of your own form")

    # Re-sign on every correction. The initiator certifies the latest state
    # of the form each time it heads back into the approval chain.
    if not payload.initiator_signature_data:
        raise HTTPException(
            status_code=400,
            detail="Your signature is required to resubmit this form."
        )
    instance.initiator_signature_data = payload.initiator_signature_data
    instance.initiator_signed_at = payload.initiator_signed_at or datetime.utcnow()

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
        # Defensive cleanup: any pre-existing approval rows on this version
        # would double up the chain. The version is fresh after send-back so
        # there shouldn't be any, but a double-click on Submit or an old
        # /submit codepath could have seeded some. Wipe and re-create from
        # the template so the chain is always exactly one row per template
        # step.
        existing = db.query(ApprovalInstance).filter(
            ApprovalInstance.form_version_id == current_ver.id
        ).all()
        for ai in existing:
            db.delete(ai)
        if existing:
            db.flush()
        try:
            approval_service.initialize_approval_steps(
                db, current_ver, instance, current_user,
                payload.selected_approver_ids
            )
        except ValueError as e:
            # Approver-resolution failure (missing manager / HOD / etc.) — the
            # form is now stuck "submitted" with no chain. Surface as 400 so
            # the user sees the actual reason instead of a generic 500.
            raise HTTPException(status_code=400, detail=str(e))

    audit_service.log_event(
        db, current_user.organization_id, "FORM_RESUBMITTED",
        user_id=current_user.id, entity_type="FormInstance", entity_id=instance.id,
        details={"new_version": instance.current_version}
    )
    _publish_workflow(current_user.organization_id, "resubmitted", instance.id, current_user.id)
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

    # Validate the file type from an allowlist. The client filename is used
    # ONLY for display metadata — never for the on-disk path, so a name like
    # "../../etc/passwd" cannot traverse out of the attachments directory.
    original_name = os.path.basename(file.filename or "").strip() or "file"
    ext = os.path.splitext(original_name)[1].lower()
    allowed_exts = {
        ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp",
        ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt",
    }
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    after_submission = instance.current_status != FormStatus.draft

    attach_dir = os.path.join(settings.MEDIA_DIR, "attachments", current_user.organization_id)
    os.makedirs(attach_dir, exist_ok=True)
    # Server-generated name = random UUID + validated extension only.
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(attach_dir, stored_name)

    # Stream to disk with a hard size cap so a huge upload can't exhaust disk.
    max_bytes = settings.MAX_UPLOAD_SIZE_BYTES
    written = 0
    try:
        with open(file_path, "wb") as f:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB limit",
                    )
                f.write(chunk)
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise

    attachment = FormAttachment(
        organization_id=current_user.organization_id,
        form_instance_id=instance.id,
        original_filename=original_name,
        stored_filename=stored_name,
        file_size=written,
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
        details={"filename": original_name, "after_submission": after_submission}
    )

    return {
        "message": "Attachment uploaded",
        "filename": original_name,
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
            delegation_allowed=step_data.delegation_allowed,
            is_required=step_data.is_required,
        )
        db.add(step)

    for cc_data in payload.cc_recipients:
        db.add(ApprovalTemplateCCRecipient(
            template_id=template.id,
            role_type=cc_data.role_type,
            role_id=cc_data.role_id,
            specific_user_id=cc_data.specific_user_id,
            hierarchy_level=cc_data.hierarchy_level,
            email=cc_data.email,
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
        # MERGE instead of delete-and-recreate, otherwise approval_instances
        # (real audit-trail rows for in-flight / completed approvals) lose
        # their template_step_id FK and Postgres raises ForeignKeyViolation.
        #
        # Strategy: match incoming steps to existing rows by step_order.
        #   - existing + in payload → UPDATE in place (keep same id)
        #   - new in payload (no matching order) → INSERT
        #   - existing not in payload → DELETE if no approval_instance
        #       references it; otherwise leave the row alone so the audit
        #       trail keeps working (the orphaned step is harmless — it's no
        #       longer in the template's active step set for new instances).
        existing_by_order = {
            row.step_order: row for row in db.query(ApprovalTemplateStep).filter(
                ApprovalTemplateStep.template_id == template_id
            ).all()
        }
        payload_orders = {s.step_order for s in payload.steps}

        for step_data in payload.steps:
            row = existing_by_order.get(step_data.step_order)
            if row is not None:
                row.step_label = step_data.step_label
                row.role_type = step_data.role_type
                row.role_id = step_data.role_id
                row.specific_user_id = step_data.specific_user_id
                row.hierarchy_level = step_data.hierarchy_level
                row.skip_if_missing = step_data.skip_if_missing
                row.delegation_allowed = step_data.delegation_allowed
                row.is_required = step_data.is_required
            else:
                db.add(ApprovalTemplateStep(
                    template_id=template.id,
                    step_order=step_data.step_order,
                    step_label=step_data.step_label,
                    role_type=step_data.role_type,
                    role_id=step_data.role_id,
                    specific_user_id=step_data.specific_user_id,
                    hierarchy_level=step_data.hierarchy_level,
                    skip_if_missing=step_data.skip_if_missing,
                    delegation_allowed=step_data.delegation_allowed,
                    is_required=step_data.is_required,
                ))

        for order, row in existing_by_order.items():
            if order in payload_orders:
                continue
            referenced = db.query(ApprovalInstance.id).filter(
                ApprovalInstance.template_step_id == row.id
            ).first()
            if referenced is None:
                db.delete(row)
            # else: leave it for the audit trail; it's harmless.

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
                email=cc_data.email,
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
