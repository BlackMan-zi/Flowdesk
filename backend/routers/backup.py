"""
Database snapshot/backup.

Admins can take a full database snapshot from the Organization Settings page
and download it as a single .xlsx workbook (one sheet per table). A scheduled
job in services/scheduler.py runs the same routine every day at 00:00.

Why one workbook of sheets and not pg_dump? It works without shell access to
the DB container, the file is human-inspectable (open in Excel/LibreOffice),
and it mirrors the working pattern already proven in the sibling Inventory
project. pg_dump remains the right tool for true binary fidelity, but isn't
needed for this read-back-and-audit workflow.
"""
import enum
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

import openpyxl
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import settings as app_settings
from core.permissions import require_roles
from database import Base, get_db
from models.user import RoleName, User


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/backup", tags=["Backup"])


BACKUP_DIR = Path(app_settings.MEDIA_DIR) / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def _excel_val(val: Any) -> Any:
    """Coerce a Python value to something openpyxl can write to a cell."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, enum.Enum):
        return val.value
    if isinstance(val, (dict, list)):
        # JSON columns — serialize so they round-trip as a single cell value.
        import json
        return json.dumps(val, default=str)
    if isinstance(val, (bytes, bytearray, memoryview)):
        try:
            return bytes(val).decode("utf-8", errors="replace")
        except Exception:
            return repr(val)
    if isinstance(val, datetime):
        # openpyxl can't store tz-aware datetimes — strip tzinfo.
        return val.replace(tzinfo=None) if val.tzinfo else val
    return val


def _safe_filename(filename: str) -> Path:
    """Return the resolved backup path; raise 400 if it escapes BACKUP_DIR."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = (BACKUP_DIR / filename).resolve()
    if not str(path).startswith(str(BACKUP_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return path


def _run_backup(db: Session) -> dict:
    """Snapshot every table in Base.metadata into one .xlsx workbook.

    Called by both the HTTP endpoint and the nightly scheduler.

    Tables are written in FK-dependency order (parents before children) so
    a future restore tool can replay inserts without violating constraints.
    """
    now = datetime.now(timezone.utc)
    date_label = now.strftime("%Y-%m-%d")
    time_label = now.strftime("%H%M%S")
    filename = f"backup_{date_label}_{time_label}.xlsx"
    filepath = BACKUP_DIR / filename

    wb = openpyxl.Workbook()
    wb.remove(wb.active)

    # sorted_tables walks FK dependencies — parents first.
    for table in Base.metadata.sorted_tables:
        # Excel caps sheet names at 31 chars; truncate deterministically.
        sheet_title = table.name[:31]
        ws = wb.create_sheet(title=sheet_title)
        headers = [col.name for col in table.columns]
        ws.append(headers)

        result = db.execute(text(f'SELECT * FROM "{table.name}"'))
        keys = list(result.keys())
        for row in result.fetchall():
            raw = dict(zip(keys, row))
            ws.append([_excel_val(raw.get(h)) for h in headers])

    wb.save(str(filepath))
    stat = filepath.stat()
    return {
        "filename": filename,
        "date_label": date_label,
        "file_size": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/list")
def list_backups(_: User = Depends(require_roles(RoleName.admin))):
    out = []
    for f in sorted(BACKUP_DIR.glob("backup_*.xlsx"), reverse=True):
        try:
            stat = f.stat()
        except FileNotFoundError:
            continue
        parts = f.stem.split("_", 2)
        date_label = parts[1] if len(parts) > 1 else f.stem
        out.append({
            "filename": f.name,
            "date_label": date_label,
            "file_size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return out


@router.post("/create", status_code=status.HTTP_201_CREATED)
def create_backup(
    _: User = Depends(require_roles(RoleName.admin)),
    db: Session = Depends(get_db),
):
    try:
        return _run_backup(db)
    except Exception as exc:
        logger.exception("Backup creation failed")
        raise HTTPException(status_code=500, detail=f"Backup failed: {exc}")


@router.get("/download/{filename}")
def download_backup(
    filename: str,
    _: User = Depends(require_roles(RoleName.admin)),
):
    filepath = _safe_filename(filename)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(
        str(filepath),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
    )


@router.delete("/{filename}")
def delete_backup(
    filename: str,
    _: User = Depends(require_roles(RoleName.admin)),
):
    filepath = _safe_filename(filename)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Backup not found")
    filepath.unlink()
    return {"message": "Backup deleted", "filename": filename}
