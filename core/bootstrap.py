from sqlalchemy import text
from sqlalchemy.orm import Session
from models.organization import Organization
from models.user import User, Role, UserRole, UserStatus, RoleCategory
from services.auth_service import hash_password, generate_temp_password
from config import settings

_FLOWDESK_ORG_ID = "org-flowdesk-system"
_FLOWDESK_ADMIN_ID = "usr-flowdesk-admin"
_FLOWDESK_ROLE_ID = "role-flowdesk-admin"

# Default email only (NOT a credential). The password is never hardcoded:
# it comes from SUPER_ADMIN_PASSWORD, or is randomly generated and logged once.
_DEFAULT_ADMIN_EMAIL = "admin@flowdesk.com"


def _ensure_email_domain_column(db: Session) -> None:
    """Add email_domain column to organizations if it doesn't exist yet."""
    try:
        db.execute(text(
            "ALTER TABLE organizations "
            "ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255) UNIQUE"
        ))
        db.commit()
    except Exception:
        db.rollback()  # column already exists or unsupported syntax — ignore


def _backfill_bsc(db: Session) -> None:
    """Set email_domain for the BSC org if it's still NULL."""
    db.execute(text(
        "UPDATE organizations SET email_domain = 'bsc.rw' "
        "WHERE id = 'org-bsc-001' AND email_domain IS NULL"
    ))
    db.commit()


def ensure_system_admin(db: Session) -> None:
    """Idempotent: migrate schema, backfill existing orgs, create FlowDesk admin."""

    _ensure_email_domain_column(db)
    _backfill_bsc(db)

    admin_email = (settings.SUPER_ADMIN_EMAIL or _DEFAULT_ADMIN_EMAIL).lower().strip()
    admin_domain = admin_email.split("@")[-1]

    # 1. Organization
    org = db.get(Organization, _FLOWDESK_ORG_ID)
    if not org:
        org = Organization(
            id=_FLOWDESK_ORG_ID,
            name="FlowDesk",
            subdomain="flowdesk",
            email_domain=admin_domain,
            subscription_plan="enterprise",
            is_active=True,
        )
        db.add(org)
        db.flush()

    # 2. Admin role
    role = db.get(Role, _FLOWDESK_ROLE_ID)
    if not role:
        role = Role(
            id=_FLOWDESK_ROLE_ID,
            organization_id=_FLOWDESK_ORG_ID,
            name="Admin",
            role_category=RoleCategory.system,
            description="System administrator",
            is_active=True,
        )
        db.add(role)
        db.flush()

    # 3. Admin user
    user = db.get(User, _FLOWDESK_ADMIN_ID)
    if not user:
        admin_password = settings.SUPER_ADMIN_PASSWORD
        if admin_password:
            print("[BOOTSTRAP] System admin created using SUPER_ADMIN_PASSWORD from environment.")
        else:
            admin_password = generate_temp_password(16)
            print("=" * 64)
            print("[BOOTSTRAP] No SUPER_ADMIN_PASSWORD set — generated a one-time password.")
            print(f"[BOOTSTRAP]   Email:    {admin_email}")
            print(f"[BOOTSTRAP]   Password: {admin_password}")
            print("[BOOTSTRAP] This is shown only once.")
            print("=" * 64)

        # The bootstrap password is always a starter credential — force a change
        # at first login regardless of whether it came from env or was generated.
        user = User(
            id=_FLOWDESK_ADMIN_ID,
            organization_id=_FLOWDESK_ORG_ID,
            name="FlowDesk Admin",
            email=admin_email,
            password_hash=hash_password(admin_password),
            status=UserStatus.active,
            must_reset_password=True,
        )
        db.add(user)
        db.flush()

        db.add(UserRole(
            user_id=_FLOWDESK_ADMIN_ID,
            role_id=_FLOWDESK_ROLE_ID,
        ))

    db.commit()
