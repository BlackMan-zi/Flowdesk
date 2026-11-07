#!/usr/bin/env python3
"""
Create a new organisation and its first admin on an EMPTY FlowDesk install.

Generic (any client), unlike the BSC-specific seed_*.py scripts. Creates:
  - the organisation (email_domain drives org auto-detection at login)
  - every role in RoleName for that organisation
  - one Admin user with a random temporary password and
    must_reset_password=True (forced to choose a new one at first login)

Run inside the API container AFTER it has started once (startup creates the
tables):
  docker exec -it flowdesk-api python3 /app/scripts/bootstrap_org.py \
      --org-name "Bonus Group" --domain bonusgroup.rw \
      --admin-name "Jane Doe" --admin-email jane.doe@bonusgroup.rw

The temporary password is printed once. Safe to re-run: it refuses to touch
an organisation that already exists.
"""
import argparse
import secrets
import sys

sys.path.insert(0, "/app")

import models.organization, models.user, models.form  # noqa: E401,F401
import models.approval, models.delegation, models.audit, models.document  # noqa: E401,F401

import bcrypt

from database import SessionLocal
from models.organization import Organization
from models.user import Role, RoleCategory, RoleName, User, UserRole, UserStatus

ROLE_CATEGORY = {
    RoleName.admin: RoleCategory.system,
    RoleName.standard_user: RoleCategory.system,
    RoleName.report_manager: RoleCategory.system,
    RoleName.observer: RoleCategory.system,
    RoleName.manager: RoleCategory.hierarchy,
    RoleName.sn_manager: RoleCategory.hierarchy,
    RoleName.hod: RoleCategory.hierarchy,
    RoleName.hr: RoleCategory.functional,
    RoleName.hr_admin: RoleCategory.functional,
    RoleName.finance: RoleCategory.functional,
    RoleName.supply_chain: RoleCategory.functional,
    RoleName.it: RoleCategory.functional,
    RoleName.cfo: RoleCategory.executive,
    RoleName.ceo: RoleCategory.executive,
    RoleName.chief_corporate: RoleCategory.executive,
}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--org-name", required=True)
    p.add_argument("--domain", required=True, help="e.g. bonusgroup.rw")
    p.add_argument("--admin-name", required=True)
    p.add_argument("--admin-email", required=True)
    a = p.parse_args()

    domain = a.domain.strip().lower()
    email = a.admin_email.strip().lower()
    if not email.endswith("@" + domain):
        print(f"ERROR: admin email must be @{domain}")
        return 1

    missing = set(RoleName) - set(ROLE_CATEGORY)
    if missing:
        print(f"ERROR: no category mapped for roles: {sorted(r.value for r in missing)}")
        return 1

    db = SessionLocal()
    try:
        if db.query(Organization).filter(Organization.email_domain == domain).first():
            print(f"ERROR: an organisation with domain {domain} already exists. Nothing changed.")
            return 1

        org = Organization(name=a.org_name.strip(), email_domain=domain, is_active=True)
        db.add(org)
        db.flush()

        roles = {}
        for rname, rcat in ROLE_CATEGORY.items():
            r = Role(organization_id=org.id, name=rname.value, role_category=rcat, is_active=True)
            db.add(r)
            roles[rname] = r
        db.flush()

        temp_pw = secrets.token_urlsafe(12)
        admin = User(
            organization_id=org.id,
            name=a.admin_name.strip(),
            email=email,
            password_hash=bcrypt.hashpw(temp_pw.encode(), bcrypt.gensalt(12)).decode(),
            status=UserStatus.active,
            must_reset_password=True,
            mfa_required=False,
            mfa_enabled=False,
        )
        db.add(admin)
        db.flush()
        for rname in (RoleName.admin, RoleName.standard_user):
            db.add(UserRole(user_id=admin.id, role_id=roles[rname].id))

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(f"Created organisation '{a.org_name}' ({domain}) with {len(ROLE_CATEGORY)} roles.")
    print(f"Admin: {email}")
    print(f"Temporary password (shown once, change at first login): {temp_pw}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
