"""Transactional test for the delegate-all flow.

Runs against the live DB but uses the SQLAlchemy savepoint pattern so
EVERY change (including the router's internal db.commit()s) is rolled back
at the end. Read-only from the user's perspective.

Run from inside the project root with the API stack up:
    python backend/scripts/test_delegate_all.py
"""

import os
import sys
import traceback
from datetime import date, timedelta

# Make backend/ importable
BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND)

# Point at the local Docker DB (port-forwarded on host)
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg2://flowdesk_app:FlowDesk_App%402024@localhost:5432/flowdesk",
)
os.environ.setdefault("ALLOWED_ORIGINS", '["http://localhost"]')
os.environ.setdefault("SECRET_KEY", "test")
os.environ.setdefault("MAIL_USERNAME", "x")
os.environ.setdefault("MAIL_PASSWORD", "x")
os.environ.setdefault("MAIL_FROM", "test@bsc.rw")
os.environ.setdefault("MAIL_SERVER", "localhost")
os.environ.setdefault("MAIL_PORT", "25")

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from config import settings
# Import every model so SQLAlchemy's registry can resolve cross-class relationships
from models import (  # noqa: F401
    user, organization, form, approval, delegation, document, audit,
)
from models.user import User
from models.delegation import Delegation
from models.approval import ApprovalInstance, ApprovalStepStatus
from schemas.delegation import DelegationCreate
from routers.delegations import create_delegation, return_delegation
from services.approval_service import get_active_delegate

OK = "\x1b[32mPASS\x1b[0m"
FAIL = "\x1b[31mFAIL\x1b[0m"


def make_savepoint_session():
    """Open a session whose commits become SAVEPOINT releases; rollback wipes all."""
    engine = create_engine(str(settings.DATABASE_URL))
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection)
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()

    return session, outer, connection


def find_test_users(db: Session):
    """Find an active approver with a real pending step + a delegate user."""
    pending = db.query(ApprovalInstance).filter(
        ApprovalInstance.status == ApprovalStepStatus.active
    ).first()
    if not pending:
        pending = db.query(ApprovalInstance).filter(
            ApprovalInstance.status == ApprovalStepStatus.waiting
        ).first()
    if not pending:
        raise RuntimeError("No active/waiting approval instances in DB — cannot test reassignment.")

    original = db.query(User).filter(User.id == pending.approver_user_id).first()
    delegate = db.query(User).filter(
        User.organization_id == original.organization_id,
        User.id != original.id
    ).first()
    return original, delegate, pending


def assert_eq(label, got, want):
    if got == want:
        print(f"  {OK} {label}: {got!r}")
        return True
    print(f"  {FAIL} {label}: got={got!r} want={want!r}")
    return False


def main():
    db, outer, conn = make_savepoint_session()
    failures = 0

    try:
        print("=" * 70)
        print("DELEGATE-ALL FLOW TEST")
        print("=" * 70)

        original, delegate, pending = find_test_users(db)
        print(f"\nOriginal approver : {original.name} ({original.id})")
        print(f"Delegate          : {delegate.name} ({delegate.id})")
        print(f"Pending step      : {pending.id} (status={pending.status.value})")

        # Snapshot before
        before_approver = pending.approver_user_id
        before_delegated_from = pending.delegated_from_user_id

        # ── Test 1: schema accepts role_id=None ─────────────────────────
        print("\n--- Test 1: DelegationCreate accepts role_id=None ---")
        payload = DelegationCreate(
            delegate_user_id=delegate.id,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=7),
            reason="delegate-all test",
        )
        if not assert_eq("payload.role_id is None", payload.role_id, None):
            failures += 1

        # ── Test 2: create_delegation w/ role_id=None creates an "all" row ──
        print("\n--- Test 2: create_delegation creates role_id IS NULL row ---")
        delegation = create_delegation(payload=payload, current_user=original, db=db)
        if not assert_eq("delegation.role_id", delegation.role_id, None):
            failures += 1
        if not assert_eq("delegation.is_active", delegation.is_active, True):
            failures += 1
        if not assert_eq("delegation.original_approver_id", delegation.original_approver_id, original.id):
            failures += 1
        if not assert_eq("delegation.delegate_user_id", delegation.delegate_user_id, delegate.id):
            failures += 1

        # ── Test 3: pending step transferred to delegate ────────────────
        print("\n--- Test 3: pending step reassigned to delegate ---")
        db.refresh(pending)
        if not assert_eq("pending.approver_user_id", pending.approver_user_id, delegate.id):
            failures += 1
        if not assert_eq("pending.delegated_from_user_id", pending.delegated_from_user_id, original.id):
            failures += 1
        if not assert_eq("pending.status (unchanged)", pending.status, ApprovalStepStatus.active if pending.status == ApprovalStepStatus.active else ApprovalStepStatus.waiting):
            failures += 1

        # ── Test 4: get_active_delegate finds the "all" delegation ──────
        print("\n--- Test 4: get_active_delegate falls back to all-delegation ---")
        # No role_id (hierarchy case)
        d1 = get_active_delegate(db, original.id, role_id=None)
        if not assert_eq("hierarchy step (role_id=None) → delegate", d1, delegate.id):
            failures += 1
        # Arbitrary role_id (functional case, no per-role delegation exists)
        from models.user import Role
        any_role = db.query(Role).first()
        d2 = get_active_delegate(db, original.id, role_id=any_role.id)
        if not assert_eq(f"functional step (role_id={any_role.name!r}) → delegate (via fallback)", d2, delegate.id):
            failures += 1

        # ── Test 5: return_delegation restores pending step ─────────────
        print("\n--- Test 5: return_delegation transfers step back ---")
        result = return_delegation(delegation_id=delegation.id, current_user=original, db=db)
        if not assert_eq("return result message", result.get("message"), "Delegation returned successfully"):
            failures += 1
        db.refresh(pending)
        if not assert_eq("pending.approver_user_id (restored)", pending.approver_user_id, before_approver):
            failures += 1
        if not assert_eq("pending.delegated_from_user_id (cleared)", pending.delegated_from_user_id, before_delegated_from):
            failures += 1
        db.refresh(delegation)
        if not assert_eq("delegation.is_active (now False)", delegation.is_active, False):
            failures += 1

        # ── Test 6: returned delegation no longer resolves as delegate ──
        print("\n--- Test 6: returned delegation drops out of get_active_delegate ---")
        d3 = get_active_delegate(db, original.id, role_id=None)
        if not assert_eq("after return, no active delegate", d3, None):
            failures += 1

        # ── Test 7: creating a second all-delegation deactivates the prior one ─
        print("\n--- Test 7: new 'all' delegation deactivates prior 'all' ---")
        first = create_delegation(payload=payload, current_user=original, db=db)
        second_payload = DelegationCreate(
            delegate_user_id=delegate.id,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=14),
            reason="superseding",
        )
        second = create_delegation(payload=second_payload, current_user=original, db=db)
        db.refresh(first)
        if not assert_eq("first.is_active (deactivated)", first.is_active, False):
            failures += 1
        if not assert_eq("second.is_active", second.is_active, True):
            failures += 1

        print("\n" + "=" * 70)
        if failures == 0:
            print(f"{OK}  ALL CHECKS PASSED")
        else:
            print(f"{FAIL}  {failures} check(s) failed")
        print("=" * 70)
        return 0 if failures == 0 else 1

    except Exception:
        print("\n!!! EXCEPTION DURING TEST !!!")
        traceback.print_exc()
        return 2
    finally:
        # Roll everything back — no DB pollution.
        outer.rollback()
        conn.close()
        print("\n(transaction rolled back — DB is unchanged)")


if __name__ == "__main__":
    sys.exit(main())
