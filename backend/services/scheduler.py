"""
Background scheduler that runs the nightly database backup at 00:00 server time.

Started/stopped by the FastAPI lifespan hook in main.py. The job calls the
same `_run_backup` that the admin button on Organization Settings calls, so
there is one code path producing snapshots whether they're triggered manually
or automatically.
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger


logger = logging.getLogger(__name__)


def _nightly_backup():
    # Imports are deferred so the scheduler module can be imported at app boot
    # without pulling the DB engine in before lifespan has had a chance to run.
    from database import SessionLocal
    from routers.backup import _run_backup

    db = SessionLocal()
    try:
        result = _run_backup(db)
        logger.info(
            "[scheduler] Nightly backup created: %s (%d bytes)",
            result["filename"],
            result["file_size"],
        )
    except Exception:
        logger.exception("[scheduler] Nightly backup failed")
    finally:
        db.close()


def start() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        _nightly_backup,
        trigger=CronTrigger(hour=0, minute=0),
        id="nightly_backup",
        name="Nightly database backup",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[scheduler] Nightly backup scheduled at 00:00 server time")
    return scheduler
