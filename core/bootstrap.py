from sqlalchemy import text
from sqlalchemy.orm import Session
from models.organization import Organization
from models.user import User, Role, UserRole, UserStatus, RoleCategory
from services.auth_service import hash_password, generate_temp_password
from config import settings

_FLOWDESK_ORG_ID = "org-flowdesk-system"

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
    """Idempotent first-run seed for the bootstrap admin.

    Safe on a database that already holds real data:
      - If an organization already owns the admin's email domain, the admin is
        attached to THAT organization (no duplicate org → no unique-constraint
        crash on email_domain).
      - If a user with the admin email already exists, nothing is changed — real
        accounts and passwords are never overwritten.
    """
    _ensure_email_domain_column(db)
    _backfill_bsc(db)

    admin_email = (settings.SUPER_ADMIN_EMAIL or _DEFAULT_ADMIN_EMAIL).lower().strip()
    admin_domain = admin_email.split("@")[-1]

    # 1. Choose the org: our system org if it exists, else an existing tenant that
    #    already owns this email domain, else create a fresh system org.
    org = db.get(Organization, _FLOWDESK_ORG_ID)
    if not org:
        org = db.query(Organization).filter(
            Organization.email_domain == admin_domain
        ).first()
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

    # 2. If this email already has an account in the org, leave it untouched.
    existing = db.query(User).filter(
        User.email == admin_email,
        User.organization_id == org.id,
    ).first()
    if existing:
        db.commit()  # persist schema/backfill work above
        return

    # 3. Ensure an "Admin" role exists in this org (reuse one if present).
    role = db.query(Role).filter(
        Role.organization_id == org.id,
        Role.name == "Admin",
        Role.is_active == True,
    ).first()
    if not role:
        role = Role(
            organization_id=org.id,
            name="Admin",
            role_category=RoleCategory.system,
            description="System administrator",
            is_active=True,
        )
        db.add(role)
        db.flush()

    # 4. Create the bootstrap admin.
    admin_password = settings.SUPER_ADMIN_PASSWORD
    if admin_password:
        print(f"[BOOTSTRAP] Creating admin {admin_email} from SUPER_ADMIN_PASSWORD.")
    else:
        admin_password = generate_temp_password(16)
        print("=" * 64)
        print("[BOOTSTRAP] No SUPER_ADMIN_PASSWORD set — generated a one-time password.")
        print(f"[BOOTSTRAP]   Email:    {admin_email}")
        print(f"[BOOTSTRAP]   Password: {admin_password}")
        print("[BOOTSTRAP] This is shown only once.")
        print("=" * 64)

    display_name = admin_email.split("@")[0].replace(".", " ").title() or "Administrator"
    user = User(
        organization_id=org.id,
        name=display_name,
        email=admin_email,
        password_hash=hash_password(admin_password),
        status=UserStatus.active,
        must_reset_password=True,  # always force a change of the starter password
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.commit()
    print(f"[BOOTSTRAP] Admin {admin_email} created in org '{org.name}'.")
