from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models.user import User, RoleName
from models.document import GeneratedDocument, DocumentShare
from models.form import FormInstance
from core.security import get_current_active_user
import os

router = APIRouter(prefix="/documents", tags=["Documents"])


@router.get("/{form_instance_id}/download")
def download_document(
    form_instance_id: str,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Download the final signed PDF for a completed form."""
    # Verify form instance is in this org
    instance = db.query(FormInstance).filter(
        FormInstance.id == form_instance_id,
        FormInstance.organization_id == current_user.organization_id
    ).first()
    if not instance:
        raise HTTPException(status_code=404, detail="Form instance not found")

    doc = db.query(GeneratedDocument).filter(
        GeneratedDocument.form_instance_id == form_instance_id,
        GeneratedDocument.is_final == True
    ).order_by(GeneratedDocument.generated_at.desc()).first()
    if not doc:
        raise HTTPException(status_code=404, detail="No generated document found for this form")

    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Document file not found on server")

    return FileResponse(
        path=doc.file_path,
        media_type="application/pdf",
        filename=doc.file_name
    )


@router.get("", response_model=List[dict])
def list_documents(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """List completed documents the user has access to.

    Admin: all documents in the org.
    Others: documents where a DocumentShare record exists for them
            (covers initiator, approvers, and CC recipients).
    """
    role_names = [ur.role.name for ur in current_user.user_roles if ur.role]

    if RoleName.admin in role_names:
        docs = db.query(GeneratedDocument).filter(
            GeneratedDocument.organization_id == current_user.organization_id,
            GeneratedDocument.is_final == True
        ).order_by(GeneratedDocument.generated_at.desc()).all()
        share_reason_map = {}  # admin sees all, no specific reason needed
    else:
        shares = db.query(DocumentShare).filter(
            DocumentShare.organization_id == current_user.organization_id,
            DocumentShare.user_id == current_user.id
        ).all()
        doc_ids = {s.document_id for s in shares}
        share_reason_map = {s.document_id: s.share_reason for s in shares}
        docs = db.query(GeneratedDocument).filter(
            GeneratedDocument.id.in_(doc_ids),
            GeneratedDocument.is_final == True
        ).order_by(GeneratedDocument.generated_at.desc()).all()

    results = []
    for doc in docs:
        inst = db.query(FormInstance).filter(
            FormInstance.id == doc.form_instance_id
        ).first()
        if inst:
            results.append({
                "id": doc.id,
                "form_instance_id": doc.form_instance_id,
                "reference_number": inst.reference_number if inst else "—",
                "file_name": doc.file_name,
                "file_size": doc.file_size,
                "generated_at": doc.generated_at,
                "share_reason": share_reason_map.get(doc.id)
            })
    return results
