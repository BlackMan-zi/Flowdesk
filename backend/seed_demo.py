"""
Seed script — creates demo org + BSC Rwanda org with all users and roles.
Run inside the container: python seed_demo.py
Password for all accounts: FlowDesk@2024
"""
import uuid
import bcrypt
from datetime import datetime
from database import SessionLocal, engine, Base
import models.approval, models.audit, models.delegation, models.document, models.form
from models.organization import Organization, Department
from models.user import User, Role, UserRole, RoleCategory, UserStatus

Base.metadata.create_all(bind=engine)
HASH = bcrypt.hashpw("FlowDesk@2024".encode(), bcrypt.gensalt(12)).decode()
NOW = datetime.utcnow()


def uid():
    return str(uuid.uuid4())


db = SessionLocal()

# ── Guard: skip if already seeded ────────────────────────────────────────────
if db.query(Organization).count() > 0:
    print("Already seeded — skipping.")
    db.close()
    exit(0)

# ── Organizations ─────────────────────────────────────────────────────────────
org_demo = Organization(id="org-demo-001", name="FlowDesk Demo", subdomain="demo",
                        email_domain="demo.com", subscription_plan="enterprise",
                        is_active=True, created_at=NOW, updated_at=NOW)
org_bsc = Organization(id="org-bsc-001", name="BSC Rwanda", subdomain="bsc",
                       email_domain="bsc.rw", subscription_plan="enterprise",
                       is_active=True, created_at=NOW, updated_at=NOW)
db.add_all([org_demo, org_bsc])
db.flush()

# ── Departments ───────────────────────────────────────────────────────────────
depts = [
    # Top-level
    Department(id="dept-ceo",        organization_id="org-bsc-001", name="CEO Office",  parent_department_id=None, is_active=True, created_at=NOW),
    Department(id="dept-technical",  organization_id="org-bsc-001", name="Technical",   parent_department_id=None, is_active=True, created_at=NOW),
    Department(id="dept-commercial", organization_id="org-bsc-001", name="Commercial",  parent_department_id=None, is_active=True, created_at=NOW),
    Department(id="dept-corporate",  organization_id="org-bsc-001", name="Corporate",   parent_department_id=None, is_active=True, created_at=NOW),
    Department(id="dept-finance",    organization_id="org-bsc-001", name="Finance",     parent_department_id=None, is_active=True, created_at=NOW),
    Department(id="dept-pmo",        organization_id="org-bsc-001", name="PMO",         parent_department_id=None, is_active=True, created_at=NOW),
]
db.add_all(depts)
db.flush()

sub_depts = [
    # CEO Office
    Department(id="unit-ceo-legal",      organization_id="org-bsc-001", name="Legal",               parent_department_id="dept-ceo",        is_active=True, created_at=NOW),
    Department(id="unit-ceo-audit",      organization_id="org-bsc-001", name="Auditor",             parent_department_id="dept-ceo",        is_active=True, created_at=NOW),
    # Technical
    Department(id="unit-tech-access",    organization_id="org-bsc-001", name="Access",              parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    Department(id="unit-tech-tx",        organization_id="org-bsc-001", name="TX",                  parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    Department(id="unit-tech-planning",  organization_id="org-bsc-001", name="Planning Projects",   parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    Department(id="unit-tech-cloud",     organization_id="org-bsc-001", name="Cloud",               parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    Department(id="unit-tech-noc",       organization_id="org-bsc-001", name="Noc",                 parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    Department(id="unit-tech-ipcore",    organization_id="org-bsc-001", name="IP Core",             parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    Department(id="unit-tech-security",  organization_id="org-bsc-001", name="Security",            parent_department_id="dept-technical",  is_active=True, created_at=NOW),
    # Commercial
    Department(id="unit-com-sales",      organization_id="org-bsc-001", name="Sales",               parent_department_id="dept-commercial", is_active=True, created_at=NOW),
    Department(id="unit-com-mktg",       organization_id="org-bsc-001", name="Marketing",           parent_department_id="dept-commercial", is_active=True, created_at=NOW),
    Department(id="unit-com-bizexp",     organization_id="org-bsc-001", name="Business Expansion",  parent_department_id="dept-commercial", is_active=True, created_at=NOW),
    Department(id="unit-com-proddev",    organization_id="org-bsc-001", name="Product Development", parent_department_id="dept-commercial", is_active=True, created_at=NOW),
    # Corporate
    Department(id="unit-corp-supchain",  organization_id="org-bsc-001", name="Supply Chain",        parent_department_id="dept-corporate",  is_active=True, created_at=NOW),
    Department(id="unit-corp-adminhr",   organization_id="org-bsc-001", name="Admin & HR",          parent_department_id="dept-corporate",  is_active=True, created_at=NOW),
    Department(id="unit-corp-hr",        organization_id="org-bsc-001", name="HR",                  parent_department_id="dept-corporate",  is_active=True, created_at=NOW),
    # Finance
    Department(id="unit-fin-acct",       organization_id="org-bsc-001", name="Accounting",          parent_department_id="dept-finance",    is_active=True, created_at=NOW),
    Department(id="unit-fin-recovery",   organization_id="org-bsc-001", name="Recovery",            parent_department_id="dept-finance",    is_active=True, created_at=NOW),
    # PMO
    Department(id="unit-pmo-sales",      organization_id="org-bsc-001", name="Project Sales",       parent_department_id="dept-pmo",        is_active=True, created_at=NOW),
    Department(id="unit-pmo-compliance", organization_id="org-bsc-001", name="Project Compliance",  parent_department_id="dept-pmo",        is_active=True, created_at=NOW),
]
db.add_all(sub_depts)
db.flush()

# ── Roles ─────────────────────────────────────────────────────────────────────
roles = [
    Role(id="role-admin",        organization_id="org-bsc-001", name="Admin",          role_category=RoleCategory.system,      is_active=True, created_at=NOW),
    Role(id="role-standard",     organization_id="org-bsc-001", name="Standard User",  role_category=RoleCategory.system,      is_active=True, created_at=NOW),
    Role(id="role-observer",     organization_id="org-bsc-001", name="Observer",       role_category=RoleCategory.system,      is_active=True, created_at=NOW),
    Role(id="role-report-mgr",   organization_id="org-bsc-001", name="Report Manager", role_category=RoleCategory.functional,  is_active=True, created_at=NOW),
    Role(id="role-manager",      organization_id="org-bsc-001", name="Manager",        role_category=RoleCategory.hierarchy,   is_active=True, created_at=NOW),
    Role(id="role-sn-manager",   organization_id="org-bsc-001", name="SN Manager",     role_category=RoleCategory.hierarchy,   is_active=True, created_at=NOW),
    Role(id="role-hod",          organization_id="org-bsc-001", name="HOD",            role_category=RoleCategory.hierarchy,   is_active=True, created_at=NOW),
    Role(id="role-hr",           organization_id="org-bsc-001", name="HR",             role_category=RoleCategory.functional,  is_active=True, created_at=NOW),
    Role(id="role-hr-admin",     organization_id="org-bsc-001", name="HR & Admin",     role_category=RoleCategory.functional,  is_active=True, created_at=NOW),
    Role(id="role-finance",      organization_id="org-bsc-001", name="Finance",        role_category=RoleCategory.functional,  is_active=True, created_at=NOW),
    Role(id="role-supply-chain", organization_id="org-bsc-001", name="Supply Chain",   role_category=RoleCategory.functional,  is_active=True, created_at=NOW),
    Role(id="role-it",           organization_id="org-bsc-001", name="IT",             role_category=RoleCategory.functional,  is_active=True, created_at=NOW),
    Role(id="role-cfo",          organization_id="org-bsc-001", name="CFO",            role_category=RoleCategory.executive,   is_active=True, created_at=NOW),
    Role(id="role-ceo",          organization_id="org-bsc-001", name="CEO",            role_category=RoleCategory.executive,   is_active=True, created_at=NOW),
    Role(id="role-chief-corp",   organization_id="org-bsc-001", name="Chief Corporate",role_category=RoleCategory.executive,   is_active=True, created_at=NOW),
    # Demo org needs its own admin role entry
    Role(id="role-demo-admin",   organization_id="org-demo-001", name="Admin",         role_category=RoleCategory.system,      is_active=True, created_at=NOW),
]
db.add_all(roles)
db.flush()

# ── Users ─────────────────────────────────────────────────────────────────────
def user(id, org, name, email, dept, **kw):
    return User(id=id, organization_id=org, name=name, email=email,
                password_hash=HASH, department_id=dept,
                status=UserStatus.active, must_reset_password=False,
                created_at=NOW, updated_at=NOW, **kw)

users = [
    user("usr-demo-admin", "org-demo-001", "System Admin",       "admin@demo.com",                  None),
    # CEO Office
    user("usr-ceo-001",  "org-bsc-001", "Gilbert Kayinamura",  "gilbert.kayinamura@bsc.rw",   "dept-ceo"),
    user("usr-ceo-002",  "org-bsc-001", "Christian Mbabazi",   "christian.mbabazi@bsc.rw",    "dept-ceo"),
    user("usr-ceo-003",  "org-bsc-001", "Ndoli Mitali",        "ndoli.mitali@bsc.rw",         "dept-ceo"),
    user("usr-ceo-004",  "org-bsc-001", "Susan Mutesi",        "susan.mutesi@bsc.rw",         "dept-ceo"),
    user("usr-ceo-005",  "org-bsc-001", "Innocent Ruzindana",  "innocent.ruzindana@bsc.rw",   "dept-ceo"),
    user("usr-ceo-006",  "org-bsc-001", "Dominique Muhire",    "dominique.muhire@bsc.rw",     "dept-ceo"),
    user("usr-ceo-007",  "org-bsc-001", "Dennis Kaliisa",      "dennis.kaliisa@bsc.rw",       "unit-ceo-legal"),
    user("usr-ceo-008",  "org-bsc-001", "Regis Nkwaya",        "regis.nkwaya@bsc.rw",         "unit-ceo-audit"),
    # Technical
    user("usr-tech-001", "org-bsc-001", "Philip Mudenge",      "philip.mudenge@bsc.rw",       "dept-technical"),
    user("usr-tech-002", "org-bsc-001", "Robert Nkeramugaba",  "robert.nkeramugaba@bsc.rw",   "dept-technical"),
    user("usr-tech-003", "org-bsc-001", "Yves Ishema",         "yves.ishema@bsc.rw",          "unit-tech-access"),
    user("usr-tech-004", "org-bsc-001", "Jean Claude Karemera","jeanclaude.karemera@bsc.rw",  "unit-tech-tx"),
    user("usr-tech-005", "org-bsc-001", "Joan Mukantagara",    "joan.mukantagara@bsc.rw",     "unit-tech-planning"),
    user("usr-tech-006", "org-bsc-001", "Richard Buregeya",    "richard.buregeya@bsc.rw",     "unit-tech-cloud"),
    user("usr-tech-007", "org-bsc-001", "Callixte Mugabo",     "callixte.mugabo@bsc.rw",      "unit-tech-noc"),
    user("usr-tech-008", "org-bsc-001", "Ingrid Iradukunda",   "ingrid.iradukunda@bsc.rw",    "unit-tech-ipcore"),
    user("usr-tech-009", "org-bsc-001", "Yves Nkaka",          "yves.nkaka@bsc.rw",           "unit-tech-security"),
    # Corporate
    user("usr-corp-001", "org-bsc-001", "Justin Munyampeta",   "justin.munyampeta@bsc.rw",    "unit-corp-supchain"),
    user("usr-corp-002", "org-bsc-001", "Noella Uwamariya",    "noella.uwamariya@bsc.rw",     "unit-corp-adminhr"),
    user("usr-corp-003", "org-bsc-001", "Nadege Umutoniwase",  "nadege.umutoniwase@bsc.rw",   "unit-corp-hr"),
    user("usr-corp-004", "org-bsc-001", "William Manzi",       "william.manzi@bsc.rw",        "unit-corp-hr"),
    # Finance
    user("usr-fin-001",  "org-bsc-001", "Felicien Batitonda",  "felicien.batitonda@bsc.rw",   "dept-finance"),
    user("usr-fin-002",  "org-bsc-001", "Daniel Muyoboke",     "daniel.muyoboke@bsc.rw",      "unit-fin-acct"),
    user("usr-fin-003",  "org-bsc-001", "Vianney Mugabo",      "vianney.mugabo@bsc.rw",       "unit-fin-recovery"),
]
db.add_all(users)
db.flush()

# ── Hierarchy links ───────────────────────────────────────────────────────────
hierarchy = {
    # CEO Office sub-units report to Gilbert (CEO)
    "usr-ceo-007": ("usr-ceo-001", None,          "usr-ceo-001"),
    "usr-ceo-008": ("usr-ceo-001", None,          "usr-ceo-001"),
    # Technical dept: Philip & Robert are SN Managers under Innocent (CTO/HOD)
    "usr-tech-001": ("usr-ceo-005", None,          "usr-ceo-005"),
    "usr-tech-002": ("usr-ceo-005", None,          "usr-ceo-005"),
    # Tech units under Philip
    "usr-tech-003": ("usr-tech-001", "usr-ceo-005", "usr-ceo-005"),
    "usr-tech-004": ("usr-tech-001", "usr-ceo-005", "usr-ceo-005"),
    "usr-tech-005": ("usr-tech-001", "usr-ceo-005", "usr-ceo-005"),
    # Tech units under Robert
    "usr-tech-006": ("usr-tech-002", "usr-ceo-005", "usr-ceo-005"),
    "usr-tech-007": ("usr-tech-002", "usr-ceo-005", "usr-ceo-005"),
    "usr-tech-008": ("usr-tech-002", "usr-ceo-005", "usr-ceo-005"),
    "usr-tech-009": ("usr-tech-002", "usr-ceo-005", "usr-ceo-005"),
    # Corporate under Susan
    "usr-corp-001": ("usr-ceo-004", None,          "usr-ceo-004"),
    "usr-corp-002": ("usr-ceo-004", None,          "usr-ceo-004"),
    "usr-corp-003": ("usr-ceo-004", None,          "usr-ceo-004"),
    "usr-corp-004": ("usr-corp-003", "usr-ceo-004", "usr-ceo-004"),
    # Finance under Christian (CFO)
    "usr-fin-001":  ("usr-ceo-002", None,          "usr-ceo-002"),
    "usr-fin-002":  ("usr-fin-001", "usr-ceo-002",  "usr-ceo-002"),
    "usr-fin-003":  ("usr-fin-001", "usr-ceo-002",  "usr-ceo-002"),
}
for uid_, (mgr, snmgr, hod) in hierarchy.items():
    u = db.query(User).filter_by(id=uid_).first()
    u.manager_id    = mgr
    u.sn_manager_id = snmgr
    u.hod_id        = hod
db.flush()

# ── User Roles ────────────────────────────────────────────────────────────────
user_role_pairs = [
    ("usr-demo-admin", "role-demo-admin"),
    ("usr-ceo-001",    "role-admin"),
    ("usr-ceo-001",    "role-hod"),
    ("usr-ceo-001",    "role-ceo"),
    ("usr-ceo-002",    "role-hod"),
    ("usr-ceo-002",    "role-cfo"),
    ("usr-ceo-003",    "role-hod"),
    ("usr-ceo-004",    "role-hod"),
    ("usr-ceo-004",    "role-chief-corp"),
    ("usr-ceo-005",    "role-hod"),
    ("usr-ceo-006",    "role-hod"),
    ("usr-tech-001",   "role-sn-manager"),
    ("usr-tech-002",   "role-sn-manager"),
    ("usr-fin-001",    "role-sn-manager"),
    ("usr-fin-001",    "role-finance"),
    ("usr-corp-003",   "role-manager"),
    ("usr-corp-003",   "role-hr"),
    ("usr-corp-002",   "role-manager"),
    ("usr-corp-002",   "role-hr-admin"),
    ("usr-corp-001",   "role-manager"),
    ("usr-corp-001",   "role-supply-chain"),
]
for u_id, r_id in user_role_pairs:
    db.add(UserRole(id=str(uuid.uuid4()), user_id=u_id, role_id=r_id, assigned_at=NOW))

# All BSC users get Standard User role
bsc_users = db.query(User).filter(User.organization_id == "org-bsc-001").all()
for u in bsc_users:
    db.add(UserRole(id=str(uuid.uuid4()), user_id=u.id, role_id="role-standard", assigned_at=NOW))

db.commit()
print(f"Seeded: {db.query(Organization).count()} orgs, "
      f"{db.query(Department).count()} depts, "
      f"{db.query(User).count()} users, "
      f"{db.query(UserRole).count()} user-roles")
db.close()
