"""
Server-side PDF generation for a submitted/approved FormInstance.

Produces a single PDF containing:
  - The org letterhead (header/footer images)
  - Form title + reference number
  - Sections + filled-in field values (honouring the schema-designer grid widths)
  - Approval history table (initiator + each approver step)
  - Image attachments inlined as full-page <img>
  - PDF attachments appended at the end via pypdf

Office docs (xlsx, docx, etc.) are listed by name at the end of the form
body but not yet inlined as pages — that requires LibreOffice headless,
which we'd add in a follow-up.

WeasyPrint renders the form to PDF bytes; pypdf concatenates appended PDFs.
"""

from __future__ import annotations
import base64
import html as html_lib
import json
import os
from io import BytesIO
from typing import Optional
from sqlalchemy.orm import Session
from weasyprint import HTML
from pypdf import PdfReader, PdfWriter

from models.form import FormInstance, FormAttachment
from models.organization import Organization
from config import settings


# ── Helpers ──────────────────────────────────────────────────────────────────

_IMAGE_EXTS = ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg')


def _data_uri(path: str) -> Optional[str]:
    if not path or not os.path.exists(path):
        return None
    ext = path.rsplit('.', 1)[-1].lower()
    mime = {
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'bmp': 'image/bmp',
        'svg': 'image/svg+xml',
    }.get(ext, 'application/octet-stream')
    with open(path, 'rb') as f:
        data = base64.b64encode(f.read()).decode('ascii')
    return f'data:{mime};base64,{data}'


def _is_image(att: FormAttachment) -> bool:
    return (att.content_type or '').startswith('image/') or \
        (att.original_filename or '').lower().endswith(_IMAGE_EXTS)


def _is_pdf(att: FormAttachment) -> bool:
    return (att.content_type or '') == 'application/pdf' or \
        (att.original_filename or '').lower().endswith('.pdf')


_GRID_TO_SPAN = {
    '1/4': 3, '1/3': 4, '1/2': 6, '2/3': 8, '3/4': 9, 'full': 12,
}


def _span(grid_width: Optional[str]) -> int:
    return _GRID_TO_SPAN.get(grid_width or 'full', 12)


def _attachment_path(att: FormAttachment) -> str:
    return os.path.join(
        settings.MEDIA_DIR, 'attachments',
        att.organization_id, att.stored_filename
    )


# System block auto_fill_sources (mirrors frontend / FormDesigner constants).
_SYSTEM_BLOCKS = {
    'reference_number': 'reference',
    'submission_date': 'submission_date',
    'form_classification': 'classification',
    'approval_block': 'approval_block',
    'static_text': 'text_static',
}


def _e(s) -> str:
    """HTML-escape user-provided strings, preserving Nones as empty."""
    if s is None:
        return ''
    return html_lib.escape(str(s))


# ── Field value rendering ────────────────────────────────────────────────────

def _render_value(field, value: Optional[str]) -> str:
    """Render a field value to HTML. Tables become nested tables, signatures
    become script-font / inline image, everything else is escaped text."""
    ft = field.field_type
    afs = field.auto_fill_source

    # System blocks — handled inline based on auto_fill_source. Reference and
    # date show as text; static text rendered as a paragraph; classification
    # shown as a coloured chip; approval_block is rendered separately (we
    # always append the approval history table at the bottom).
    if afs == 'static_text':
        return f'<div class="static-text">{_e(field.default_value or "")}</div>'
    if afs == 'submission_date':
        return _e(value or '')
    if afs == 'form_classification':
        return _e(value or '')
    if afs == 'reference_number':
        # Reference is rendered by the page header chrome, not as a field.
        return ''
    if afs == 'approval_block':
        # Skip — full Approval History table is rendered after sections.
        return ''

    if not value:
        return '—'

    if ft == 'table':
        try:
            rows = json.loads(value)
            if not isinstance(rows, list) or not rows:
                return '—'
            cols = field.table_columns or []
            if not cols:
                # Derive columns from the first row's keys.
                cols = [{'key': k, 'label': k, 'type': 'text'} for k in rows[0].keys()]
            html = '<table class="data-table"><thead><tr>'
            for c in cols:
                html += f'<th>{_e(c.get("label") or c.get("key"))}</th>'
            html += '</tr></thead><tbody>'
            for r in rows:
                html += '<tr>'
                for c in cols:
                    html += f'<td>{_e(r.get(c["key"], ""))}</td>'
                html += '</tr>'
            html += '</tbody></table>'
            return html
        except Exception:
            return _e(value)

    if ft == 'signature':
        v = value.strip()
        if v.startswith('data:image/'):
            return f'<img class="sig-img" src="{v}" alt="signature">'
        if v.startswith('type:'):
            return f'<span class="sig-text">{_e(v[5:])}</span>'
        return _e(v)

    if ft == 'textarea':
        # Preserve line breaks.
        return _e(value).replace('\n', '<br>')

    return _e(value)


# ── Main entry point ─────────────────────────────────────────────────────────

class _SnapshotField:
    """Lightweight stand-in for an SA FormField, built from a JSON snapshot
    dict. Read-only — used only for PDF rendering."""
    def __init__(self, d: dict):
        self.__dict__.update(d)
        # field_type is a string in the snapshot; preserve that. The renderer
        # only compares with string literals so an Enum is unnecessary.

    @property
    def is_active(self):  # always true in snapshot
        return True


class _SnapshotFormDef:
    """Read-only adapter that lets the PDF renderer treat a JSON schema
    snapshot the same way it treats a live SA FormDefinition."""
    def __init__(self, d: dict):
        self._d = d
        self.id = d.get('id')
        self.name = d.get('name')
        self.printed_title = d.get('printed_title')
        self.description = d.get('description')
        self.code_suffix = d.get('code_suffix')
        self.confidentiality = d.get('confidentiality')
        self.section_layouts = d.get('section_layouts') or {}
        self.fields = [_SnapshotField(f) for f in (d.get('fields') or [])]


def generate_form_pdf(db: Session, instance: FormInstance) -> bytes:
    """Build the PDF bytes for a FormInstance. Caller must have eager-loaded
    versions/field_values/attachments/form_definition.fields."""
    org = db.query(Organization).filter(Organization.id == instance.organization_id).first()
    accent = getattr(org, 'letterhead_accent', None) or '#0066B3'

    # Prefer the schema snapshot frozen at submit time over the live form
    # definition, so admin edits to the form don't disturb this submission.
    current_ver_for_snapshot = next(
        (v for v in instance.versions if v.version_number == instance.current_version),
        None,
    )
    snapshot = getattr(current_ver_for_snapshot, 'schema_snapshot', None) if current_ver_for_snapshot else None
    form_def = _SnapshotFormDef(snapshot) if snapshot else instance.form_definition

    header_uri = _data_uri(getattr(org, 'header_image_path', None))
    footer_uri = _data_uri(getattr(org, 'footer_image_path', None))

    # Current version → field values map keyed by field id.
    current_ver = next(
        (v for v in instance.versions if v.version_number == instance.current_version),
        None,
    )
    field_values_map: dict[str, str] = {}
    if current_ver:
        for fv in current_ver.field_values:
            field_values_map[fv.form_field_id] = fv.value or ''

    # Organise active fields by section, preserving display order.
    sections: dict[str, list] = {}
    section_order: list[str] = []
    for f in (form_def.fields or []):
        if getattr(f, 'is_active', True) is False:
            continue
        # Reference block is auto-rendered in the page header; skip placed copies.
        if f.auto_fill_source == 'reference_number':
            continue
        s_name = f.section_name or 'General'
        if s_name not in sections:
            sections[s_name] = []
            section_order.append(s_name)
        sections[s_name].append(f)
    for s in sections.values():
        s.sort(key=lambda f: f.display_order or 0)

    section_layouts = form_def.section_layouts or {}

    # Approval steps for the history table (initiator prepended).
    approval_rows: list[dict] = []
    if instance.submitted_at:
        approval_rows.append({
            'label': 'Submitted by Initiator',
            'approver': instance.creator.name if instance.creator else '—',
            'status': 'Approved',
            'date': instance.submitted_at.strftime('%d %b %Y'),
            'notes': '',
        })
    if current_ver:
        steps = sorted(current_ver.approval_instances, key=lambda a: a.step_order)
        for s in steps:
            approval_rows.append({
                'label': s.step_label or f'Step {s.step_order}',
                'approver': s.approver.name if s.approver else '—',
                'status': s.status.value if hasattr(s.status, 'value') else str(s.status),
                'date': s.signed_at.strftime('%d %b %Y') if s.signed_at else '—',
                'notes': s.notes or '',
            })

    # Inline image attachments + list of "other" attachments rendered at end.
    image_atts: list[dict] = []
    other_atts: list[FormAttachment] = []
    for att in instance.attachments or []:
        if _is_image(att):
            uri = _data_uri(_attachment_path(att))
            if uri:
                image_atts.append({'filename': att.original_filename, 'uri': uri})
        elif not _is_pdf(att):
            # PDF attachments are appended after WeasyPrint render via pypdf.
            other_atts.append(att)

    # ── Build sections HTML ──
    sections_html_parts = []
    for sname in section_order:
        layout = section_layouts.get(sname, 'grid')
        sections_html_parts.append(
            f'<div class="section-header">'
            f'<div class="bar"></div>'
            f'<h2>{_e(sname)}</h2>'
            f'<div class="line"></div>'
            f'</div>'
        )
        fields = sections[sname]
        if layout == 'stack':
            grid_style = ''
            container_class = 'stack'
        elif layout == 'row':
            grid_style = f'grid-template-columns: repeat({max(1, len(fields))}, minmax(0, 1fr));'
            container_class = 'row'
        else:
            grid_style = ''
            container_class = 'grid'
        sections_html_parts.append(
            f'<div class="fields {container_class}" style="{grid_style}">'
        )
        for f in fields:
            value = field_values_map.get(f.id, '')
            rendered = _render_value(f, value)
            if f.auto_fill_source in ('approval_block', 'reference_number'):
                continue  # skip system blocks rendered elsewhere
            label = _e(f.field_label or '')
            if layout == 'grid':
                span_style = f'grid-column: span {_span(f.grid_width)};'
            else:
                span_style = ''
            sections_html_parts.append(
                f'<div class="field" style="{span_style}">'
                f'<label>{label}</label>'
                f'<div class="value">{rendered}</div>'
                f'</div>'
            )
        sections_html_parts.append('</div>')
    sections_html = ''.join(sections_html_parts)

    # ── Approval history table ──
    approval_html = ''
    if approval_rows:
        rows = ''.join(
            f'<tr>'
            f'<td>{_e(r["label"])}</td>'
            f'<td>{_e(r["approver"])}</td>'
            f'<td>{_e(r["status"])}</td>'
            f'<td>{_e(r["date"])}</td>'
            f'<td class="notes">{_e(r["notes"])}</td>'
            f'</tr>'
            for r in approval_rows
        )
        approval_html = (
            f'<div class="section-header">'
            f'<div class="bar"></div>'
            f'<h2>Approval History</h2>'
            f'<div class="line"></div>'
            f'</div>'
            f'<table class="approval-table">'
            f'<thead><tr>'
            f'<th>Step</th><th>Approver</th><th>Status</th><th>Date</th><th>Notes</th>'
            f'</tr></thead>'
            f'<tbody>{rows}</tbody>'
            f'</table>'
        )

    # ── Other-attachments list ──
    other_atts_html = ''
    if other_atts:
        items = ''.join(
            f'<li>{_e(a.original_filename)} <span class="att-meta">— {_e(a.content_type or "file")}</span></li>'
            for a in other_atts
        )
        other_atts_html = (
            f'<div class="section-header">'
            f'<div class="bar"></div>'
            f'<h2>Other Attachments</h2>'
            f'<div class="line"></div>'
            f'</div>'
            f'<ul class="other-atts">{items}</ul>'
        )

    # ── Image attachment pages ──
    image_pages_html = ''.join(
        f'<div class="attachment-page">'
        f'<div class="att-label">Attachment: {_e(img["filename"])}</div>'
        f'<img src="{img["uri"]}" alt="">'
        f'</div>'
        for img in image_atts
    )

    # ── Title block ──
    title = form_def.printed_title or form_def.name or 'Form'

    html = f"""
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  @page {{ size: A4; margin: 0; }}
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'DejaVu Sans', Arial, sans-serif; font-size: 11px; margin: 0; color: #1f2937; }}
  .page {{ min-height: 29.7cm; display: flex; flex-direction: column; }}
  .header {{ height: 3cm; display: flex; align-items: center; justify-content: center; padding: 0 2cm; border-bottom: 1px solid #f3f4f6; flex-shrink: 0; }}
  .header img {{ max-height: 2.6cm; max-width: 100%; object-fit: contain; }}
  .body {{ flex: 1; padding: 1cm 2cm 1cm; }}
  .footer {{ height: 2cm; display: flex; align-items: flex-end; justify-content: center; padding: 0 2cm 0.5cm; border-top: 1px solid #f3f4f6; flex-shrink: 0; }}
  .footer img {{ max-height: 1.5cm; max-width: 100%; object-fit: contain; }}
  h1.title {{ text-align: center; color: {accent}; font-size: 18px; font-weight: bold; margin: 0 0 0.2em; }}
  .divider {{ margin: 0.3em auto 0; width: 1.5cm; height: 2px; background: {accent}; border-radius: 1px; }}
  .ref {{ text-align: center; font-family: 'DejaVu Sans Mono', monospace; font-size: 10px; color: #6b7280; margin: 0.5em 0 1em; }}
  .section-header {{ display: flex; align-items: center; gap: 0.5em; margin: 0.8em 0 0.4em; page-break-after: avoid; }}
  .section-header .bar {{ width: 12px; height: 3px; background: {accent}; }}
  .section-header h2 {{ color: {accent}; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; white-space: nowrap; }}
  .section-header .line {{ flex: 1; height: 1px; background: #e5e7eb; }}
  .fields.grid {{ display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px 12px; margin-bottom: 0.4em; }}
  .fields.row {{ display: grid; gap: 4px 12px; margin-bottom: 0.4em; }}
  .fields.stack {{ display: block; margin-bottom: 0.4em; }}
  .fields.stack .field {{ margin-bottom: 6px; }}
  .field {{ padding: 2px 0; min-width: 0; }}
  .field label {{ display: block; color: #6b7280; font-size: 10px; margin-bottom: 1px; }}
  .field .value {{ color: #1f2937; font-size: 11px; word-break: break-word; }}
  .static-text {{ font-size: 11px; color: #374151; white-space: pre-wrap; }}
  .sig-img {{ height: 24px; }}
  .sig-text {{ font-family: 'Brush Script MT', cursive; font-size: 18px; color: #1f2937; }}
  .data-table {{ width: 100%; border-collapse: collapse; }}
  .data-table th, .data-table td {{ border: 1px solid #e5e7eb; padding: 3px 6px; font-size: 10px; text-align: left; }}
  .data-table th {{ background: #f9fafb; font-weight: 600; }}
  .approval-table {{ width: 100%; border-collapse: collapse; margin-top: 0.5em; }}
  .approval-table th, .approval-table td {{ padding: 4px 6px; font-size: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }}
  .approval-table th {{ color: #6b7280; font-weight: 600; background: #f9fafb; }}
  .approval-table .notes {{ font-style: italic; color: #6b7280; }}
  .other-atts {{ margin: 0; padding-left: 18px; font-size: 10px; }}
  .other-atts li {{ margin: 2px 0; }}
  .other-atts .att-meta {{ color: #6b7280; }}
  .attachment-page {{ page-break-before: always; padding: 1.5cm 2cm; }}
  .att-label {{ font-size: 10px; color: #6b7280; margin-bottom: 0.5em; }}
  .attachment-page img {{ max-width: 100%; max-height: 25cm; display: block; margin: 0 auto; }}
</style></head><body>
  <div class="page">
    <div class="header">{f'<img src="{header_uri}">' if header_uri else ''}</div>
    <div class="body">
      <h1 class="title">{_e(title)}</h1>
      <div class="divider"></div>
      <div class="ref">Ref: {_e(instance.reference_number)}</div>
      {sections_html}
      {approval_html}
      {other_atts_html}
    </div>
    <div class="footer">{f'<img src="{footer_uri}">' if footer_uri else ''}</div>
  </div>
  {image_pages_html}
</body></html>"""

    # ── Render to PDF ──
    pdf_bytes = HTML(string=html).write_pdf()

    # ── Append PDF attachments via pypdf ──
    pdf_atts = [a for a in (instance.attachments or []) if _is_pdf(a)]
    if pdf_atts:
        writer = PdfWriter()
        for page in PdfReader(BytesIO(pdf_bytes)).pages:
            writer.add_page(page)
        for att in pdf_atts:
            path = _attachment_path(att)
            if not os.path.exists(path):
                continue
            try:
                for page in PdfReader(path).pages:
                    writer.add_page(page)
            except Exception as e:  # pragma: no cover — best-effort append
                print(f"[pdf_service] Skipping bad PDF attachment '{att.original_filename}': {e}")
        output = BytesIO()
        writer.write(output)
        pdf_bytes = output.getvalue()

    return pdf_bytes
