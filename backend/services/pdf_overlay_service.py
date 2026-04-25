"""
PDF Overlay Service
===================
Overlays form field values onto the original PDF template, producing a
pixel-perfect final document that preserves the original branding and layout.

After overlay, an audit/approval page is appended.
"""
import io
import os
import base64
import json
from typing import Optional

from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.units import cm
from PIL import Image as PILImage

from sqlalchemy.orm import Session
from models.form import FormInstance, FormFieldValue, FormField, FieldType


BRAND_BLUE = colors.HexColor("#1a3d6b")
BRAND_LIGHT = colors.HexColor("#e8f0fe")
BRAND_LINE = colors.HexColor("#d0dff5")
TEXT_DARK = colors.HexColor("#1a1a2e")
TEXT_GRAY = colors.HexColor("#555566")


# ── Coordinate helpers ────────────────────────────────────────────────────────

def _to_pts(x_pct, y_pct, w_pct, h_pct, page_w, page_h):
    """Convert percentage-based coordinates to PDF points (bottom-left origin)."""
    x = (x_pct / 100.0) * page_w
    h = (h_pct / 100.0) * page_h
    w = (w_pct / 100.0) * page_w
    # PDF y=0 is bottom; our y=0 is top — flip
    y = page_h - ((y_pct / 100.0) * page_h) - h
    return x, y, w, h


# ── Draw helpers ──────────────────────────────────────────────────────────────

def _draw_text(c, value: str, x, y, w, h, font_size=None):
    """Draw a text string inside a field box, auto-sized."""
    if not value:
        return
    fs = font_size or min(h * 0.6, 10)
    c.setFont("Helvetica", fs)
    c.setFillColorRGB(0.05, 0.05, 0.1)
    # Vertical centre
    text_y = y + (h - fs) / 2.0
    # Clip to width
    max_chars = max(1, int(w / (fs * 0.55)))
    c.drawString(x + 2, text_y, str(value)[:max_chars])


def _draw_signature(c, value: str, x, y, w, h):
    """Render a base64 PNG signature into the field box."""
    try:
        img_bytes = base64.b64decode(value.split(",")[-1])
        img_reader = ImageReader(io.BytesIO(img_bytes))
        c.drawImage(img_reader, x, y, width=w, height=h,
                    preserveAspectRatio=True, mask="auto")
    except Exception:
        _draw_text(c, "[Signature]", x, y, w, h)


def _draw_table_field(c, value: str, columns: list, x, y, w, h):
    """Render a table/grid field onto the canvas."""
    try:
        rows = json.loads(value) if value else []
    except Exception:
        return
    if not rows or not columns:
        return

    headers = [col.get("label", col.get("key", "")) for col in columns]
    data = [headers]
    for row in rows:
        data.append([str(row.get(col["key"], "")) for col in columns])

    col_w = w / max(len(columns), 1)

    from reportlab.platypus import Table as RLTable, TableStyle as RLTS
    tbl = RLTable(data, colWidths=[col_w] * len(columns))
    tbl.setStyle(RLTS([
        ("FONTSIZE",   (0, 0), (-1, -1), 7),
        ("FONTNAME",   (0, 0), (-1,  0), "Helvetica-Bold"),
        ("FONTNAME",   (0, 1), (-1, -1), "Helvetica"),
        ("BACKGROUND", (0, 0), (-1,  0), (0.88, 0.88, 0.92)),
        ("GRID",       (0, 0), (-1, -1), 0.3, (0.6, 0.6, 0.6)),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
    ]))
    tbl_w, tbl_h = tbl.wrapOn(c, w, h)
    tbl.drawOn(c, x, y + h - tbl_h)


# ── Main overlay function ─────────────────────────────────────────────────────

def overlay_pdf(
    template_path: str,
    fields: list,           # list of FormField ORM objects
    field_values: dict,     # {field_id: value_string}
) -> bytes:
    """
    Overlay form data onto a PDF template page by page.
    Returns PDF bytes (without audit page — caller appends that separately).
    """
    reader = PdfReader(template_path)
    writer = PdfWriter()

    for page_idx, page in enumerate(reader.pages):
        page_num = page_idx + 1
        pw = float(page.mediabox.width)
        ph = float(page.mediabox.height)

        page_fields = [
            f for f in fields
            if (f.page_number or 1) == page_num and f.x_pct is not None
        ]

        if not page_fields:
            writer.add_page(page)
            continue

        # Build overlay canvas for this page
        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=(pw, ph))

        for field in page_fields:
            val = field_values.get(field.id)
            if field.default_value and not val:
                val = field.default_value
            if not val:
                continue

            x, y, fw, fh = _to_pts(
                field.x_pct, field.y_pct,
                field.width_pct, field.height_pct,
                pw, ph
            )

            ft = field.field_type
            if ft == FieldType.signature:
                if val.startswith("data:image"):
                    _draw_signature(c, val, x, y, fw, fh)
            elif ft == FieldType.table:
                _draw_table_field(c, val, field.table_columns or [], x, y, fw, fh)
            elif ft == FieldType.checkbox:
                # comma-separated checked values
                checked = [v.strip() for v in val.split(",") if v.strip()]
                label_parts = []
                for opt in (field.options or []):
                    prefix = "☑ " if opt in checked else "☐ "
                    label_parts.append(prefix + opt)
                _draw_text(c, "  ".join(label_parts), x, y, fw, fh)
            elif ft == FieldType.currency:
                try:
                    formatted = f"${float(val):,.2f}"
                except Exception:
                    formatted = val
                _draw_text(c, formatted, x, y, fw, fh)
            else:
                _draw_text(c, str(val), x, y, fw, fh)

        c.save()
        buf.seek(0)

        overlay_page = PdfReader(buf).pages[0]
        page.merge_page(overlay_page)
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


# ── Audit / approval appendix ─────────────────────────────────────────────────

def _build_audit_page(
    form_instance: FormInstance,
    organization_name: str,
    db: Session,
) -> bytes:
    """Generate a ReportLab audit+signature page to append after the form."""
    from models.approval import ApprovalInstance, ApprovalStepStatus
    from models.document import Signature

    styles = getSampleStyleSheet()
    label_st = ParagraphStyle("L", fontSize=9, textColor=TEXT_GRAY, fontName="Helvetica-Bold")
    value_st = ParagraphStyle("V", fontSize=10, textColor=TEXT_DARK, fontName="Helvetica")
    sec_st   = ParagraphStyle("S", fontSize=11, textColor=BRAND_BLUE, spaceBefore=14,
                               spaceAfter=6, fontName="Helvetica-Bold")
    small_st = ParagraphStyle("Sm", fontSize=8, textColor=TEXT_GRAY, fontName="Helvetica")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2*cm, bottomMargin=2*cm)
    elems = []

    elems.append(Paragraph(f"{organization_name}", sec_st))
    elems.append(HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=6))
    elems.append(Paragraph("Approval &amp; Audit Record", sec_st))

    # Meta
    creator = form_instance.creator
    meta = [
        ["Reference:", form_instance.reference_number,
         "Status:", form_instance.current_status.value],
        ["Submitted by:", creator.name if creator else "—",
         "Date:", form_instance.submitted_at.strftime("%d %b %Y") if form_instance.submitted_at else "—"],
    ]
    mt = Table(meta, colWidths=[3.5*cm, 6*cm, 3.5*cm, 4*cm])
    mt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), BRAND_BLUE),
        ("TEXTCOLOR", (2, 0), (2, -1), BRAND_BLUE),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [BRAND_LIGHT, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.3, BRAND_LINE),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elems.append(mt)
    elems.append(Spacer(1, 10))

    # Approval chain
    current_ver = next(
        (v for v in form_instance.versions if v.version_number == form_instance.current_version),
        None
    )
    if current_ver:
        steps = db.query(ApprovalInstance).filter(
            ApprovalInstance.form_version_id == current_ver.id
        ).order_by(ApprovalInstance.step_order).all()

        if steps:
            elems.append(Paragraph("Approval Chain", sec_st))
            ap_rows = [["Step", "Approver", "Status", "Date", "Notes"]]
            for ap in steps:
                ap_rows.append([
                    ap.step_label or f"Step {ap.step_order}",
                    ap.approver.name if ap.approver else "—",
                    ap.status.value,
                    ap.signed_at.strftime("%d %b %Y") if ap.signed_at else "—",
                    ap.notes or "—",
                ])
            at = Table(ap_rows, colWidths=[3.5*cm, 4*cm, 2.5*cm, 3*cm, 4*cm])
            at.setStyle(TableStyle([
                ("FONTNAME",   (0, 0), (-1,  0), "Helvetica-Bold"),
                ("FONTSIZE",   (0, 0), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1,  0), BRAND_BLUE),
                ("TEXTCOLOR",  (0, 0), (-1,  0), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [BRAND_LIGHT, colors.white]),
                ("GRID",       (0, 0), (-1, -1), 0.3, BRAND_LINE),
                ("TOPPADDING",    (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elems.append(at)
            elems.append(Spacer(1, 10))

            # Signatures
            approved = [s for s in steps
                        if s.status == ApprovalStepStatus.approved and s.signature_id]
            if approved:
                elems.append(Paragraph("Signatures", sec_st))
                for ap in approved:
                    sig = db.query(Signature).filter(Signature.id == ap.signature_id).first()
                    row = [[
                        Paragraph(f"<b>{ap.step_label or 'Approver'}</b>", label_st),
                        Paragraph(ap.approver.name if ap.approver else "—", value_st),
                        Paragraph(ap.signed_at.strftime("%d %b %Y") if ap.signed_at else "—", small_st),
                    ]]
                    if sig and sig.signature_data:
                        try:
                            img_data = base64.b64decode(sig.signature_data.split(",")[-1])
                            row.append([ImageReader(io.BytesIO(img_data)), "", ""])
                        except Exception:
                            row.append([Paragraph("—", small_st), "", ""])
                    st = Table(row, colWidths=[5*cm, 5*cm, 7*cm])
                    st.setStyle(TableStyle([
                        ("BOX",       (0, 0), (-1, -1), 0.5, BRAND_LINE),
                        ("LINEAFTER", (0, 0), (1, -1),  0.3, BRAND_LINE),
                        ("TOPPADDING",    (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]))
                    elems.append(st)
                    elems.append(Spacer(1, 4))

    from datetime import datetime
    elems.append(Spacer(1, 16))
    elems.append(HRFlowable(width="100%", thickness=0.5, color=BRAND_LINE))
    elems.append(Paragraph(
        f"Generated by FlowDesk · {datetime.utcnow().strftime('%d %b %Y %H:%M')} UTC  "
        f"· Document is legally binding upon all signatories.",
        small_st
    ))

    doc.build(elems)
    return buf.getvalue()


# ── Public entry point ────────────────────────────────────────────────────────

def generate_pdf_with_overlay(
    db: Session,
    form_instance: FormInstance,
    organization_name: str,
) -> bytes:
    """
    If the form has a PDF template, overlay form data on it and append the
    audit page. Otherwise fall back to generate_final_pdf from document_service.
    """
    form_def = form_instance.form_definition
    if not form_def or not form_def.pdf_template_path:
        return None  # Signal caller to use fallback

    template_path = form_def.pdf_template_path
    if not os.path.exists(template_path):
        return None

    # Collect field values from current version
    current_ver = next(
        (v for v in form_instance.versions if v.version_number == form_instance.current_version),
        None
    )
    field_values = {}
    if current_ver:
        fvs = db.query(FormFieldValue).filter(
            FormFieldValue.form_version_id == current_ver.id
        ).all()
        field_values = {fv.form_field_id: fv.value for fv in fvs}

    active_fields = [f for f in form_def.fields if f.is_active and f.x_pct is not None]

    # Overlay form data on PDF template
    filled_pdf_bytes = overlay_pdf(template_path, active_fields, field_values)

    # Build audit / approval appendix page
    audit_bytes = _build_audit_page(form_instance, organization_name, db)

    # Merge: filled form pages + audit page
    writer = PdfWriter()
    for reader in [PdfReader(io.BytesIO(filled_pdf_bytes)), PdfReader(io.BytesIO(audit_bytes))]:
        for page in reader.pages:
            writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
