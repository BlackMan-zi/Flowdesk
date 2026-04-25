import os
import io
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, Image
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import base64
from models.form import FormInstance, FormVersion, FormFieldValue
from models.approval import ApprovalInstance, ApprovalStepStatus
from models.document import GeneratedDocument, Signature
from config import settings


BRAND_BLUE = colors.HexColor("#1a3d6b")
BRAND_LIGHT = colors.HexColor("#e8f0fe")
BRAND_LINE = colors.HexColor("#d0dff5")
TEXT_DARK = colors.HexColor("#1a1a2e")
TEXT_GRAY = colors.HexColor("#555566")


def _get_styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", fontSize=18, textColor=BRAND_BLUE,
            spaceAfter=4, fontName="Helvetica-Bold"
        ),
        "subtitle": ParagraphStyle(
            "Subtitle", fontSize=10, textColor=TEXT_GRAY,
            spaceAfter=2, fontName="Helvetica"
        ),
        "section": ParagraphStyle(
            "Section", fontSize=11, textColor=BRAND_BLUE,
            spaceBefore=14, spaceAfter=6, fontName="Helvetica-Bold"
        ),
        "label": ParagraphStyle(
            "Label", fontSize=9, textColor=TEXT_GRAY, fontName="Helvetica-Bold"
        ),
        "value": ParagraphStyle(
            "Value", fontSize=10, textColor=TEXT_DARK, fontName="Helvetica"
        ),
        "small": ParagraphStyle(
            "Small", fontSize=8, textColor=TEXT_GRAY, fontName="Helvetica"
        ),
    }


def _signature_image(sig: Signature, width=4*cm, height=1.8*cm):
    """Return a ReportLab Image from base64 signature data."""
    try:
        if sig.signature_data:
            data = base64.b64decode(sig.signature_data.split(",")[-1])
            return Image(io.BytesIO(data), width=width, height=height)
        elif sig.file_path and os.path.exists(sig.file_path):
            return Image(sig.file_path, width=width, height=height)
    except Exception:
        pass
    return Paragraph("[Signature unavailable]", getSampleStyleSheet()["Normal"])


def generate_final_pdf(
    db: Session,
    form_instance: FormInstance,
    organization_name: str
) -> bytes:
    """Generate a complete signed PDF for the form instance."""
    styles = _get_styles()
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm
    )

    elements = []

    # ── HEADER ──────────────────────────────────────────────────────────────
    elements.append(Paragraph(f"{organization_name}", styles["title"]))
    elements.append(Paragraph("FlowDesk — Workflow & Approval Platform", styles["subtitle"]))
    elements.append(HRFlowable(width="100%", thickness=2, color=BRAND_BLUE, spaceAfter=8))

    form_def = form_instance.form_definition
    elements.append(Paragraph(form_def.name if form_def else "Form", styles["title"]))

    meta_data = [
        ["Reference Number:", form_instance.reference_number, "Status:", form_instance.current_status.value],
        ["Initiated By:", form_instance.creator.name, "Date Submitted:",
         form_instance.submitted_at.strftime("%d %b %Y") if form_instance.submitted_at else "-"],
        ["Department:", form_instance.creator.department.name if form_instance.creator.department else "-",
         "Version:", str(form_instance.current_version)],
    ]
    meta_table = Table(meta_data, colWidths=[3.5*cm, 6*cm, 3.5*cm, 4*cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), BRAND_BLUE),
        ("TEXTCOLOR", (2, 0), (2, -1), BRAND_BLUE),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [BRAND_LIGHT, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.3, BRAND_LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    # ── FORM DATA ────────────────────────────────────────────────────────────
    elements.append(Paragraph("Form Data", styles["section"]))

    # Get active version
    current_version = next(
        (v for v in form_instance.versions if v.version_number == form_instance.current_version), None
    )
    if current_version:
        field_values = db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == current_version.id
        ).all()

        field_data = [["Field", "Value"]]
        for fv in field_values:
            label = fv.form_field.field_label if fv.form_field else fv.form_field_id
            field_data.append([label, fv.value or "—"])

        if len(field_data) > 1:
            field_table = Table(field_data, colWidths=[7*cm, 10*cm])
            field_table.setStyle(TableStyle([
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRAND_LIGHT, colors.white]),
                ("GRID", (0, 0), (-1, -1), 0.3, BRAND_LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]))
            elements.append(field_table)
    elements.append(Spacer(1, 12))

    # ── APPROVAL CHAIN ───────────────────────────────────────────────────────
    elements.append(Paragraph("Approval Chain", styles["section"]))

    approval_steps = db.query(ApprovalInstance).filter(
        ApprovalInstance.form_version_id == current_version.id if current_version else None
    ).order_by(ApprovalInstance.step_order).all() if current_version else []

    if approval_steps:
        ap_data = [["Step", "Role / Approver", "Status", "Signed At", "Notes"]]
        for ap in approval_steps:
            approver_name = ap.approver.name if ap.approver else "—"
            if ap.delegated_from_user_id and ap.delegated_from:
                approver_name += f"\n(delegated from {ap.delegated_from.name})"
            signed_str = ap.signed_at.strftime("%d %b %Y %H:%M") if ap.signed_at else "—"
            ap_data.append([
                str(ap.step_order),
                f"{ap.step_label or '-'}\n{approver_name}",
                ap.status.value,
                signed_str,
                ap.notes or "—"
            ])
        ap_table = Table(ap_data, colWidths=[1*cm, 5.5*cm, 3*cm, 3.5*cm, 4*cm])
        ap_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRAND_LIGHT, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.3, BRAND_LINE),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(ap_table)
    elements.append(Spacer(1, 12))

    # ── SIGNATURES ────────────────────────────────────────────────────────────
    approved_steps = [s for s in approval_steps if s.status == ApprovalStepStatus.approved and s.signature_id]
    if approved_steps:
        elements.append(Paragraph("Signatures", styles["section"]))
        sig_rows = []
        for ap in approved_steps:
            sig = db.query(Signature).filter(Signature.id == ap.signature_id).first()
            row_label = [
                Paragraph(f"<b>{ap.step_label or 'Approver'}</b>", styles["label"]),
                Paragraph(ap.approver.name if ap.approver else "—", styles["value"]),
                Paragraph(ap.signed_at.strftime("%d %b %Y") if ap.signed_at else "—", styles["small"])
            ]
            row_sig = [
                _signature_image(sig) if sig else Paragraph("—", styles["small"]),
                "", ""
            ]
            sig_rows.append(row_label)
            sig_rows.append(row_sig)

        sig_table = Table(sig_rows, colWidths=[5*cm, 5*cm, 7*cm])
        sig_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("BOX", (0, 0), (-1, -1), 0.5, BRAND_LINE),
            ("LINEAFTER", (0, 0), (1, -1), 0.3, BRAND_LINE),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(sig_table)
    elements.append(Spacer(1, 12))

    # ── VERSION HISTORY ──────────────────────────────────────────────────────
    if len(form_instance.versions) > 1:
        elements.append(Paragraph("Version History", styles["section"]))
        ver_data = [["Version", "Changed By", "Date", "Notes"]]
        for ver in sorted(form_instance.versions, key=lambda v: v.version_number):
            ver_data.append([
                f"v{ver.version_number}",
                ver.creator.name if ver.creator else "—",
                ver.created_at.strftime("%d %b %Y"),
                ver.change_notes or "—"
            ])
        ver_table = Table(ver_data, colWidths=[2*cm, 5*cm, 4*cm, 6*cm])
        ver_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRAND_LIGHT, colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.3, BRAND_LINE),
        ]))
        elements.append(ver_table)

    # ── FOOTER ────────────────────────────────────────────────────────────────
    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=1, color=BRAND_LINE))
    elements.append(Paragraph(
        f"Generated by FlowDesk on {datetime.utcnow().strftime('%d %b %Y %H:%M')} UTC  •  "
        f"Document is legally binding upon all signatories.",
        styles["small"]
    ))

    doc.build(elements)
    return buffer.getvalue()


def save_generated_document(
    db: Session,
    form_instance: FormInstance,
    pdf_bytes: bytes,
    organization_id: str,
    user_id: Optional[str] = None
) -> GeneratedDocument:
    """Save PDF to disk and create GeneratedDocument record."""
    media_dir = os.path.join(settings.MEDIA_DIR, "documents", organization_id)
    os.makedirs(media_dir, exist_ok=True)

    filename = f"{form_instance.reference_number.replace('/', '-')}_final.pdf"
    file_path = os.path.join(media_dir, filename)

    with open(file_path, "wb") as f:
        f.write(pdf_bytes)

    current_ver = next(
        (v for v in form_instance.versions if v.version_number == form_instance.current_version),
        None
    )

    doc = GeneratedDocument(
        organization_id=organization_id,
        form_instance_id=form_instance.id,
        form_version_id=current_ver.id if current_ver else None,
        file_name=filename,
        file_path=file_path,
        file_size=len(pdf_bytes),
        is_final=True,
        generated_by=user_id
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
