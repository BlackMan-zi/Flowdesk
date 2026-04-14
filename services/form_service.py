import re
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from models.form import (
    FormDefinition, FormField, FormInstance, FormVersion,
    FormFieldValue, FormStatus, VersionStatus
)
from models.user import User
from typing import List, Optional


def generate_reference_number(db: Session, organization_id: str, code_suffix: str) -> str:
    """Generate reference like FD-LRQ-0001."""
    # Count existing instances for this org + suffix
    count = db.query(func.count(FormInstance.id)).filter(
        FormInstance.organization_id == organization_id,
        FormInstance.reference_number.like(f"%-{code_suffix}-%")
    ).scalar() or 0
    seq = str(count + 1).zfill(4)
    year = datetime.utcnow().strftime("%Y")
    return f"FD-{code_suffix}-{year}-{seq}"


def create_form_instance(
    db: Session,
    organization_id: str,
    form_definition_id: str,
    created_by_user: User,
    field_values: List[dict],
    backdated_date: Optional[datetime] = None
) -> FormInstance:
    """Create a new form instance in Draft status with version 1."""
    form_def = db.query(FormDefinition).filter(
        FormDefinition.id == form_definition_id,
        FormDefinition.organization_id == organization_id,
        FormDefinition.is_active == True
    ).first()
    if not form_def:
        raise ValueError("Form definition not found or inactive")

    reference = generate_reference_number(db, organization_id, form_def.code_suffix)

    instance = FormInstance(
        organization_id=organization_id,
        form_definition_id=form_definition_id,
        reference_number=reference,
        created_by=created_by_user.id,
        current_status=FormStatus.draft,
        current_version=1,
        backdated_date=backdated_date
    )
    db.add(instance)
    db.flush()

    version = FormVersion(
        form_instance_id=instance.id,
        version_number=1,
        created_by=created_by_user.id,
        status=VersionStatus.draft
    )
    db.add(version)
    db.flush()

    _save_field_values(db, version.id, field_values, form_def=form_def, user=created_by_user)
    db.commit()
    db.refresh(instance)
    return instance


def _resolve_auto_fill(source: str, user: User) -> Optional[str]:
    """Resolve auto_fill_source tokens against the submitting user's org hierarchy."""
    # Determine top-level department and unit
    dept = user.department if user else None
    if dept and dept.parent_department_id:
        unit_name = dept.name
        top_dept_name = dept.parent_department.name if dept.parent_department else None
    else:
        unit_name = None
        top_dept_name = dept.name if dept else None

    mapping = {
        "current_user.name":              user.name if user else None,
        "current_user.email":             user.email if user else None,
        "current_user.department.name":   top_dept_name,
        "current_user.unit.name":         unit_name,
        "current_user.top_department.name": top_dept_name,
        "current_user.manager.name":      user.manager.name if user and user.manager else None,
        "current_user.manager.email":     user.manager.email if user and user.manager else None,
        "current_user.sn_manager.name":   user.sn_manager.name if user and user.sn_manager else None,
        "current_user.sn_manager.email":  user.sn_manager.email if user and user.sn_manager else None,
        "current_user.hod.name":          user.hod.name if user and user.hod else None,
        "current_user.hod.email":         user.hod.email if user and user.hod else None,
    }
    return mapping.get(source)


def _save_field_values(db: Session, version_id: str, field_values: List[dict],
                       form_def=None, user: Optional[User] = None):
    """
    Persist field values. For auto-filled fields whose value wasn't provided by
    the client, resolve from the submitting user's org hierarchy.
    """
    provided = {fv["form_field_id"]: fv.get("value") for fv in field_values}

    # Auto-fill any hierarchy fields not already supplied
    if form_def and user:
        for field in (form_def.fields or []):
            if field.auto_filled and field.auto_fill_source and field.id not in provided:
                resolved = _resolve_auto_fill(field.auto_fill_source, user)
                if resolved:
                    provided[field.id] = resolved

    for field_id, value in provided.items():
        val = FormFieldValue(
            form_version_id=version_id,
            form_field_id=field_id,
            value=value
        )
        db.add(val)


def submit_form(
    db: Session,
    instance: FormInstance,
    user: User,
    field_values: List[dict],
    change_notes: Optional[str] = None
) -> FormInstance:
    """Submit a draft form (changes status and activates approval steps)."""
    if instance.current_status not in [FormStatus.draft, FormStatus.returned_for_correction]:
        raise ValueError(f"Cannot submit form in status: {instance.current_status}")

    # Update current version's field values and mark active
    current_ver = _get_current_version(db, instance)
    if current_ver:
        # Remove old values
        db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == current_ver.id
        ).delete()
        _save_field_values(db, current_ver.id, field_values)
        current_ver.status = VersionStatus.active
        if change_notes:
            current_ver.change_notes = change_notes

    instance.current_status = FormStatus.submitted
    instance.submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(instance)
    return instance


def create_new_version_on_correction(
    db: Session,
    instance: FormInstance,
    user: User,
    change_notes: str
) -> FormVersion:
    """Create a new draft version after sent-back; supersede old version."""
    # Supersede old active version
    old_ver = _get_current_version(db, instance)
    if old_ver:
        old_ver.status = VersionStatus.superseded

    new_version_number = instance.current_version + 1
    instance.current_version = new_version_number
    instance.current_status = FormStatus.returned_for_correction

    new_ver = FormVersion(
        form_instance_id=instance.id,
        version_number=new_version_number,
        created_by=user.id,
        change_notes=change_notes,
        status=VersionStatus.draft
    )
    db.add(new_ver)

    # Copy field values from old version as starting point
    if old_ver:
        old_values = db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == old_ver.id
        ).all()
        for ov in old_values:
            new_fv = FormFieldValue(
                form_version_id=new_ver.id,
                form_field_id=ov.form_field_id,
                value=ov.value
            )
            db.add(new_fv)

    db.commit()
    db.refresh(new_ver)
    return new_ver


def _get_current_version(db: Session, instance: FormInstance) -> Optional[FormVersion]:
    return db.query(FormVersion).filter(
        FormVersion.form_instance_id == instance.id,
        FormVersion.version_number == instance.current_version
    ).first()


def get_field_diff(
    db: Session,
    version_a_id: str,
    version_b_id: str
) -> List[dict]:
    """Return list of fields that changed between two versions."""
    vals_a = {
        fv.form_field_id: fv.value
        for fv in db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == version_a_id
        ).all()
    }
    vals_b = {
        fv.form_field_id: fv.value
        for fv in db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == version_b_id
        ).all()
    }
    all_fields = set(vals_a.keys()) | set(vals_b.keys())
    diff = []
    for field_id in all_fields:
        a = vals_a.get(field_id)
        b = vals_b.get(field_id)
        if a != b:
            diff.append({"field_id": field_id, "old_value": a, "new_value": b})
    return diff
