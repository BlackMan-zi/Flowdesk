"""Create fabricated demo/trial users for testing FlowDesk's approval
workflows, without touching the real seeded BSC Rwanda staff and without
ever attempting to send an email.

ONE-OFF SCRIPT. Run manually inside the API container:
    python /app/scripts/create_demo_trial_users.py

What it does:
- Creates 3 new Roles under org-bsc-001 if they don't already exist:
  Chief Commercial (Executive), Legal (Functional), Logistics (Functional).
- Creates 12 fabricated demo users (@bsc.rw, obviously-fake "demo.*" local
  parts so they can never be mistaken for real staff), each already Active
  with must_reset_password=False, all sharing one password.
- Uses raw SQL only (like reset_all_passwords.py) — never imports the email
  service and never calls the HTTP API, so no email is ever attempted
  regardless of live SMTP credentials.
- Idempotent: re-running skips any role/user that already exists by id.

Reads DATABASE_URL from the container env (already set by docker compose).
"""

import os
import sys
import uuid

import bcrypt
from sqlalchemy import create_engine, text

ORG_ID = "org-bsc-001"
DEMO_PASSWORD = "Demo2026!"

# (id, name, role_category) — role_category must be the lowercase Postgres
# enum NAME (e.g. "executive"), not the display value ("Executive"):
# SQLAlchemy's Enum type stores Python enum .name by default, not .value.
NEW_ROLES = [
    ("role-chief-commercial", "Chief Commercial", "executive"),
    ("role-legal", "Legal", "functional"),
    ("role-logistics", "Logistics", "functional"),
]

# (id, name, email, department_id, role_id)
DEMO_USERS = [
    ("usr-demo-hr", "Demo HR", "demo.hr@bsc.rw", "unit-corp-hr", "role-hr"),
    ("usr-demo-hradmin", "Demo HR Admin", "demo.hradmin@bsc.rw", "unit-corp-adminhr", "role-hr-admin"),
    ("usr-demo-finance", "Demo Finance", "demo.finance@bsc.rw", "dept-finance", "role-finance"),
    ("usr-demo-supchain", "Demo Supply Chain", "demo.supplychain@bsc.rw", "unit-corp-supchain", "role-supply-chain"),
    ("usr-demo-it", "Demo IT", "demo.it@bsc.rw", "dept-technical", "role-it"),
    ("usr-demo-cfo", "Demo CFO", "demo.cfo@bsc.rw", "dept-ceo", "role-cfo"),
    ("usr-demo-ceo", "Demo CEO", "demo.ceo@bsc.rw", "dept-ceo", "role-ceo"),
    ("usr-demo-chiefcorp", "Demo Chief Corporate", "demo.chiefcorporate@bsc.rw", "dept-ceo", "role-chief-corp"),
    ("usr-demo-chiefcomm", "Demo Chief Commercial", "demo.chiefcommercial@bsc.rw", "dept-ceo", "role-chief-commercial"),
    ("usr-demo-dirpmo", "Demo Director PMO", "demo.directorpmo@bsc.rw", "dept-ceo", "role-hod"),
    ("usr-demo-legal", "Demo Legal", "demo.legal@bsc.rw", "unit-ceo-legal", "role-legal"),
    ("usr-demo-logistics", "Demo Logistics", "demo.logistics@bsc.rw", "dept-corporate", "role-logistics"),
]


def main() -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL is not set in this container.", file=sys.stderr)
        return 1

    hashed = bcrypt.hashpw(DEMO_PASSWORD.encode("utf-8"), bcrypt.gensalt(12)).decode("utf-8")
    engine = create_engine(database_url)

    with engine.begin() as conn:
        for role_id, name, category in NEW_ROLES:
            conn.execute(
                text(
                    "INSERT INTO roles (id, organization_id, name, role_category, description, is_active, created_at) "
                    "VALUES (:id, :org, :name, :cat, :desc, TRUE, NOW()) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                {"id": role_id, "org": ORG_ID, "name": name, "cat": category, "desc": f"{name} approver"},
            )

        created = 0
        for user_id, name, email, dept_id, role_id in DEMO_USERS:
            result = conn.execute(
                text(
                    "INSERT INTO users (id, organization_id, name, email, password_hash, department_id, "
                    "status, must_reset_password, created_at) "
                    "VALUES (:id, :org, :name, :email, :hash, :dept, 'active', FALSE, NOW()) "
                    "ON CONFLICT (id) DO NOTHING"
                ),
                {"id": user_id, "org": ORG_ID, "name": name, "email": email, "hash": hashed, "dept": dept_id},
            )
            if result.rowcount:
                created += 1
                conn.execute(
                    text(
                        "INSERT INTO user_roles (id, user_id, role_id, assigned_at) "
                        "VALUES (:id, :uid, :rid, NOW())"
                    ),
                    {"id": str(uuid.uuid4()), "uid": user_id, "rid": role_id},
                )
                print(f"Created  {name:<24} {email:<32} role={role_id}")
            else:
                print(f"Skipped (already exists)  {name:<24} {email}")

    print(f"\nDone. {created} new demo user(s) created. Shared password: {DEMO_PASSWORD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
