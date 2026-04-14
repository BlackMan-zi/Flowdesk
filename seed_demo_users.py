#!/usr/bin/env python3
"""
BSC Demo Users seed script.
Creates BSC organisation (or uses existing one) with all staff using @bsc.demo emails
and the shared demo password FlowDesk@2024.

Run inside the API container:
  docker exec flowdesk-api-1 python3 /app/seed_demo_users.py
"""
import sys
sys.path.insert(0, '/app')

import models.organization, models.user, models.form
import models.approval, models.delegation, models.audit, models.document

from database import SessionLocal
from models.organization import Organization, Department
from models.user import User, Role, UserRole, RoleName, RoleCategory, UserStatus
from passlib.context import CryptContext
import uuid, unicodedata, re

pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')

DEMO_PASSWORD = "FlowDesk@2024"
EMAIL_DOMAIN  = "bsc.demo"

def gid(): return str(uuid.uuid4())

def normalize(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[^a-zA-Z0-9]", "", s)
    return s.lower()

def make_email(fname, lname):
    f = normalize(fname.split()[0])
    l = normalize(lname.split()[0])
    return f"{f}.{l}@{EMAIL_DOMAIN}"


# ── User list ─────────────────────────────────────────────────────────────────
# (first_name, last_name, department, unit_or_None, level)
USERS = [
    # CEO Office
    ("Gilbert",       "Kayinamura",   "CEO Office", None,                "CEO"),
    ("Christian",     "Mbabazi",      "CEO Office", None,                "Chief Finance"),
    ("Ndoli",         "Mitali",       "CEO Office", None,                "Chief Commercial"),
    ("Susan",         "Mutesi",       "CEO Office", None,                "Chief Corporate"),
    ("Innocent",      "Ruzindana",    "CEO Office", None,                "Chief Technical"),
    ("Dominique",     "Muhire",       "CEO Office", None,                "Director of PMO"),
    ("Dennis",        "Kaliisa",      "CEO Office", "Legal",             "Manager"),
    ("Regis",         "Nkwaya",       "CEO Office", "Auditor",           "Manager"),

    # Technical
    ("Philip",        "Mudenge",      "Technical",  None,                "Senior Manager"),
    ("Robert",        "Nkeramugaba",  "Technical",  None,                "Senior Manager"),
    ("Yves",          "Ishema",       "Technical",  "Access",            "Manager"),
    ("Jean Claude",   "Karemera",     "Technical",  "TX",                "Manager"),
    ("Joan",          "Mukantagara",  "Technical",  "Planning Projects", "Manager"),
    ("Richard",       "Buregeya",     "Technical",  "Cloud",             "Manager"),
    ("Callixte",      "Mugabo",       "Technical",  "Noc",               "Manager"),
    ("Ingrid",        "Iradukunda",   "Technical",  "IP Core",           "Manager"),
    ("Denis",         "Rukundo",      "Technical",  "IP Core",           "Manager"),
    ("Yves",          "Nkaka",        "Technical",  "Security",          "Manager"),
    ("Julien",        "Amahirwe",     "Technical",  "Access",            "Officer"),
    ("Alexis",        "Habarimana",   "Technical",  "Access",            "Officer"),
    ("Mechack",       "Iradukunda",   "Technical",  "Access",            "Officer"),
    ("Janvier",       "Kalisa",       "Technical",  "Access",            "Officer"),
    ("Elimine",       "Kwizera",      "Technical",  "Access",            "Officer"),
    ("Fabrice",       "Mbera",        "Technical",  "Access",            "Officer"),
    ("Richard",       "Mucyo",        "Technical",  "Access",            "Officer"),
    ("Jean Claude",   "Ngoga",        "Technical",  "Access",            "Officer"),
    ("Fidele",        "Nduhungirehe", "Technical",  "Access",            "Officer"),
    ("Gervais",       "Nzayisenga",   "Technical",  "Access",            "Officer"),
    ("Cyprien",       "Rugambwa",     "Technical",  "Access",            "Officer"),
    ("Djafari",       "Shema",        "Technical",  "Access",            "Officer"),
    ("Emmanuel",      "Tuganimana",   "Technical",  "Access",            "Officer"),
    ("Osee",          "Tuyihimbaze",  "Technical",  "Access",            "Officer"),
    ("Frank",         "Rutaganira",   "Technical",  "Access",            "Officer"),
    ("Patrick",       "Muragwa",      "Technical",  "Cloud",             "Officer"),
    ("Patrick",       "Sengabo",      "Technical",  "Cloud",             "Officer"),
    ("Stella",        "Igihozo",      "Technical",  "Noc",               "Officer"),
    ("Materne",       "Kalingungu",   "Technical",  "Noc",               "Officer"),
    ("Amza",          "Mbaraga",      "Technical",  "Noc",               "Officer"),
    ("Blessing",      "Munana",       "Technical",  "Noc",               "Officer"),
    ("Jean de Dieu",  "Ndahayo",      "Technical",  "Noc",               "Officer"),
    ("Desire",        "Rutaganira",   "Technical",  "Noc",               "Officer"),
    ("Brendah",       "Umutoniwase",  "Technical",  "Noc",               "Officer"),
    ("Jessica",       "Kankundiye",   "Technical",  "IP Core",           "Officer"),
    ("Elie",          "Nshimiye",     "Technical",  "IP Core",           "Officer"),
    ("Joseph",        "Muhire",       "Technical",  "TX",                "Officer"),
    ("Ernest",        "Nkurunziza",   "Technical",  "TX",                "Officer"),
    ("Gady",          "Mutangana",    "Technical",  "TX",                "Officer"),
    ("Willy",         "Nyarwaya",     "Technical",  "Planning Projects", "Officer"),
    ("Alain",         "Mugisha",      "Technical",  "Security",          "Officer"),
    ("Joyeuse",       "Tuyishime",    "Technical",  "Security",          "Officer"),
    ("Mireille",      "Ukeye",        "Technical",  "Security",          "Officer"),

    # Commercial
    ("Patrick",       "Mugisha",      "Commercial", "Sales",             "Senior Manager"),
    ("Omer",          "Banza",        "Commercial", "Business Expansion","Manager"),
    ("Duncan",        "Mugisha",      "Commercial", "Marketing",         "Manager"),
    ("Alphonsine",    "Mukamana",     "Commercial", "Sales",             "Manager"),
    ("Jean de Dieu",  "Tuyishime",    "Commercial", "Product Development","Manager"),
    ("Raissa",        "Atete",        "Commercial", "Marketing",         "Officer"),
    ("Sheilla",       "Bazizane",     "Commercial", "Marketing",         "Officer"),
    ("Richard",       "Buntu",        "Commercial", "Sales",             "Officer"),
    ("Moses",         "Gahigi",       "Commercial", "Sales",             "Officer"),
    ("Nadia",         "Gasana",       "Commercial", "Sales",             "Officer"),
    ("Bon Coeur",     "Habiyakare",   "Commercial", "Sales",             "Officer"),
    ("Hope",          "Kayesu",       "Commercial", "Sales",             "Officer"),
    ("Denis",         "Kayitare",     "Commercial", "Sales",             "Officer"),
    ("Germain",       "Musoni",       "Commercial", "Sales",             "Officer"),
    ("Thamar",        "Niyitegeka",   "Commercial", "Sales",             "Officer"),
    ("Chris Marie",   "Ngabonziza",   "Commercial", "Sales",             "Officer"),
    ("Justin",        "Shyaka",       "Commercial", "Sales",             "Officer"),
    ("Justine",       "Mudahogora",   "Commercial", "Product Development","Officer"),

    # Corporate
    ("Justin",        "Munyampeta",   "Corporate",  "Supply Chain",      "Manager"),
    ("Noella",        "Uwamariya",    "Corporate",  "Admin & HR",        "Manager"),
    ("Nadege",        "Umutoniwase",  "Corporate",  "HR",                "Manager"),
    ("Papias",        "Bahizi",       "Corporate",  "Supply Chain",      "Officer"),
    ("Alain",         "Iyakaremye",   "Corporate",  "Supply Chain",      "Officer"),
    ("Keneth",        "Murinda",      "Corporate",  "Supply Chain",      "Officer"),
    ("Evelyne",       "Mutunge",      "Corporate",  "Supply Chain",      "Officer"),
    ("Henriette",     "Uwera",        "Corporate",  "Supply Chain",      "Officer"),
    ("Grace",         "Batamuliza",   "Corporate",  "Admin & HR",        "Officer"),
    ("Didas",         "Mugisha",      "Corporate",  "Admin & HR",        "Officer"),
    ("Christophe",    "Niyimubona",   "Corporate",  "Admin & HR",        "Officer"),
    ("Jean Marie",    "Rukundo",      "Corporate",  "Admin & HR",        "Officer"),
    ("William",       "Manzi",        "Corporate",  "HR",                "Officer"),

    # Finance
    ("Felicien",      "Batitonda",    "Finance",    None,                "Senior Manager"),
    ("Daniel",        "Muyoboke",     "Finance",    "Accounting",        "Manager"),
    ("Vianney",       "Mugabo",       "Finance",    "Recovery",          "Manager"),
    ("Damascene",     "Ngororano",    "Finance",    "Accounting",        "Officer"),
    ("Pacifique",     "Nkurunziza",   "Finance",    "Accounting",        "Officer"),
    ("Cynthia",       "Umulisa",      "Finance",    "Accounting",        "Officer"),
    ("John",          "Katungi",      "Finance",    "Recovery",          "Officer"),
    ("Julienne",      "Kayitesi",     "Finance",    "Recovery",          "Officer"),
    ("Jonas",         "Mihigo",       "Finance",    "Recovery",          "Officer"),
    ("Alliance",      "Mwangaza",     "Finance",    "Recovery",          "Officer"),
    ("Theophile",     "Ndacyayisenga","Finance",    "Recovery",          "Officer"),
    ("Doreen",        "Umurungi",     "Finance",    "Recovery",          "Officer"),
    ("Beatrice",      "Uwamahoro",    "Finance",    "Recovery",          "Officer"),

    # PMO
    ("Shaffy",        "Muhizi",       "PMO",        "Project Sales",     "Senior Manager"),
    ("Alain Cedrick", "Manzi",        "PMO",        "Project Sales",     "Officer"),
    ("Lydie",         "Kayitesi",     "PMO",        "Project Compliance","Officer"),
    ("Brian",         "Manzi",        "PMO",        "Project Compliance","Officer"),
    ("Michael",       "Ngamije",      "PMO",        "Project Compliance","Officer"),
    ("Emeline",       "Nikuzwe",      "PMO",        "Project Compliance","Officer"),
    ("Olivier",       "Niyonshuti",   "PMO",        "Project Compliance","Officer"),
]

HIERARCHY = {
    ("technical", "access", "officer"):            {"mgr": "yves ishema",          "sm": "philip mudenge",      "hod": "innocent ruzindana"},
    ("technical", "access", "manager"):            {"mgr": "philip mudenge",        "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", "tx", "officer"):                {"mgr": "jean claude karemera",  "sm": "philip mudenge",      "hod": "innocent ruzindana"},
    ("technical", "tx", "manager"):                {"mgr": "philip mudenge",        "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", "planning projects", "officer"): {"mgr": "joan mukantagara",      "sm": "philip mudenge",      "hod": "innocent ruzindana"},
    ("technical", "planning projects", "manager"): {"mgr": "philip mudenge",        "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", "cloud", "officer"):             {"mgr": "richard buregeya",      "sm": "robert nkeramugaba",  "hod": "innocent ruzindana"},
    ("technical", "cloud", "manager"):             {"mgr": "robert nkeramugaba",    "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", "noc", "officer"):               {"mgr": "callixte mugabo",       "sm": "robert nkeramugaba",  "hod": "innocent ruzindana"},
    ("technical", "noc", "manager"):               {"mgr": "robert nkeramugaba",    "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", "ip core", "officer"):           {"mgr": "ingrid iradukunda",     "sm": "robert nkeramugaba",  "hod": "innocent ruzindana"},
    ("technical", "ip core", "manager"):           {"mgr": "robert nkeramugaba",    "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", "security", "officer"):          {"mgr": "yves nkaka",            "sm": "innocent ruzindana",  "hod": "innocent ruzindana"},
    ("technical", "security", "manager"):          {"mgr": "innocent ruzindana",    "sm": None,                  "hod": "innocent ruzindana"},
    ("technical", None, "senior manager"):         {"mgr": "innocent ruzindana",    "sm": None,                  "hod": "innocent ruzindana"},
    ("commercial", "sales", "officer"):            {"mgr": "alphonsine mukamana",   "sm": "patrick mugisha",     "hod": "ndoli mitali"},
    ("commercial", "sales", "manager"):            {"mgr": "patrick mugisha",       "sm": None,                  "hod": "ndoli mitali"},
    ("commercial", "sales", "senior manager"):     {"mgr": "ndoli mitali",          "sm": None,                  "hod": "ndoli mitali"},
    ("commercial", "marketing", "officer"):        {"mgr": "duncan mugisha",        "sm": "ndoli mitali",        "hod": "ndoli mitali"},
    ("commercial", "marketing", "manager"):        {"mgr": "ndoli mitali",          "sm": None,                  "hod": "ndoli mitali"},
    ("commercial", "business expansion", "officer"):    {"mgr": "omer banza",       "sm": "ndoli mitali",        "hod": "ndoli mitali"},
    ("commercial", "business expansion", "manager"):    {"mgr": "ndoli mitali",     "sm": None,                  "hod": "ndoli mitali"},
    ("commercial", "product development", "officer"):   {"mgr": "jean de dieu tuyishime", "sm": "ndoli mitali",  "hod": "ndoli mitali"},
    ("commercial", "product development", "manager"):   {"mgr": "ndoli mitali",     "sm": None,                  "hod": "ndoli mitali"},
    ("corporate", "supply chain", "officer"):      {"mgr": "justin munyampeta",     "sm": "susan mutesi",        "hod": "susan mutesi"},
    ("corporate", "supply chain", "manager"):      {"mgr": "susan mutesi",          "sm": None,                  "hod": "susan mutesi"},
    ("corporate", "admin & hr", "officer"):        {"mgr": "noella uwamariya",      "sm": "susan mutesi",        "hod": "susan mutesi"},
    ("corporate", "admin & hr", "manager"):        {"mgr": "susan mutesi",          "sm": None,                  "hod": "susan mutesi"},
    ("corporate", "hr", "officer"):                {"mgr": "nadege umutoniwase",    "sm": "susan mutesi",        "hod": "susan mutesi"},
    ("corporate", "hr", "manager"):                {"mgr": "susan mutesi",          "sm": None,                  "hod": "susan mutesi"},
    ("finance", "accounting", "officer"):          {"mgr": "daniel muyoboke",       "sm": "felicien batitonda",  "hod": "christian mbabazi"},
    ("finance", "accounting", "manager"):          {"mgr": "felicien batitonda",    "sm": None,                  "hod": "christian mbabazi"},
    ("finance", "recovery", "officer"):            {"mgr": "vianney mugabo",        "sm": "felicien batitonda",  "hod": "christian mbabazi"},
    ("finance", "recovery", "manager"):            {"mgr": "felicien batitonda",    "sm": None,                  "hod": "christian mbabazi"},
    ("finance", None, "senior manager"):           {"mgr": "christian mbabazi",     "sm": None,                  "hod": "christian mbabazi"},
    ("pmo", "project sales", "officer"):           {"mgr": "shaffy muhizi",         "sm": "dominique muhire",    "hod": "dominique muhire"},
    ("pmo", "project sales", "senior manager"):    {"mgr": "dominique muhire",      "sm": None,                  "hod": "dominique muhire"},
    ("pmo", "project compliance", "officer"):      {"mgr": "shaffy muhizi",         "sm": "dominique muhire",    "hod": "dominique muhire"},
    ("ceo office", "legal", "manager"):            {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
    ("ceo office", "auditor", "manager"):          {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief finance"):         {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief commercial"):      {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief corporate"):       {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief technical"):       {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
    ("ceo office", None, "director of pmo"):       {"mgr": "gilbert kayinamura",    "sm": None,                  "hod": "gilbert kayinamura"},
}

def get_hierarchy_rule(dept, unit, level):
    d = dept.lower()  if dept  else None
    u = unit.lower()  if unit  else None
    l = level.lower()
    return HIERARCHY.get((d, u, l)) or HIERARCHY.get((d, None, l))


def main():
    db = SessionLocal()

    print(f"\n{'='*60}")
    print("  BSC Demo Seed Script")
    print(f"  Password : {DEMO_PASSWORD}")
    print(f"  Domain   : @{EMAIL_DOMAIN}")
    print(f"{'='*60}\n")

    hashed_pw = pwd_ctx.hash(DEMO_PASSWORD)

    # ── Organization ─────────────────────────────────────────────────────────
    org = db.query(Organization).filter(Organization.name.ilike("BSC%")).first()
    if not org:
        org = Organization(id=gid(), name="BSC Rwanda", subdomain="bsc", subscription_plan="enterprise")
        db.add(org)
        db.flush()
        print(f"Created organisation: {org.name}")
    else:
        print(f"Using existing organisation: {org.name}")

    # ── Roles ─────────────────────────────────────────────────────────────────
    role_defs = [
        (RoleName.admin,         RoleCategory.system,    "System Administrator"),
        (RoleName.standard_user, RoleCategory.system,    "Standard User"),
        (RoleName.observer,      RoleCategory.system,    "Observer (read-only)"),
        (RoleName.manager,       RoleCategory.hierarchy, "Unit Manager"),
        (RoleName.sn_manager,    RoleCategory.hierarchy, "Senior Manager"),
        (RoleName.hod,           RoleCategory.hierarchy, "Head of Department"),
        (RoleName.ceo,           RoleCategory.executive, "CEO"),
    ]
    role_map = {}
    for rname, rcat, rdesc in role_defs:
        r = db.query(Role).filter(Role.organization_id == org.id, Role.name == rname.value).first()
        if not r:
            r = Role(id=gid(), organization_id=org.id, name=rname.value,
                     role_category=rcat, description=rdesc, is_active=True)
            db.add(r)
        role_map[rname.value] = r
    db.flush()
    print("Roles ready.")

    # ── Departments ───────────────────────────────────────────────────────────
    dept_names = ['CEO Office', 'Technical', 'Commercial', 'Corporate', 'Finance', 'PMO']
    dept_map = {}
    for dname in dept_names:
        dept = db.query(Department).filter(
            Department.organization_id == org.id,
            Department.name == dname,
            Department.parent_department_id == None
        ).first()
        if not dept:
            dept = Department(id=gid(), organization_id=org.id, name=dname, is_active=True)
            db.add(dept)
        dept_map[dname] = dept
    db.flush()

    units_def = {
        'CEO Office': ['Legal', 'Auditor'],
        'Technical':  ['Access', 'TX', 'Planning Projects', 'Cloud', 'Noc', 'IP Core', 'Security'],
        'Commercial': ['Sales', 'Marketing', 'Business Expansion', 'Product Development'],
        'Corporate':  ['Supply Chain', 'Admin & HR', 'HR'],
        'Finance':    ['Accounting', 'Recovery'],
        'PMO':        ['Project Compliance', 'Project Sales'],
    }
    unit_map = {}
    for dname, units in units_def.items():
        parent = dept_map[dname]
        for uname in units:
            key = f"{dname}/{uname}"
            unit = db.query(Department).filter(
                Department.organization_id == org.id,
                Department.name == uname,
                Department.parent_department_id == parent.id
            ).first()
            if not unit:
                unit = Department(id=gid(), organization_id=org.id, name=uname,
                                  parent_department_id=parent.id, is_active=True)
                db.add(unit)
            unit_map[key] = unit
    db.flush()
    print("Departments ready.")

    def resolve_dept(dept_name, unit_name):
        if unit_name:
            key = f"{dept_name}/{unit_name}"
            if key in unit_map:
                return unit_map[key]
        return dept_map.get(dept_name)

    # ── Users ─────────────────────────────────────────────────────────────────
    user_lookup = {}
    for u in db.query(User).filter(User.organization_id == org.id).all():
        user_lookup[u.name.lower()] = u

    level_to_flowdesk_roles = {
        "ceo":               ["Admin", "HOD", "CEO"],
        "chief finance":     ["HOD"],
        "chief commercial":  ["HOD"],
        "chief corporate":   ["HOD"],
        "chief technical":   ["HOD"],
        "director of pmo":   ["HOD"],
        "senior manager":    ["SN Manager"],
        "manager":           ["Manager"],
        "officer":           ["Standard User"],
    }

    print("\nCreating users...")
    created = 0
    skipped = 0
    tracked = []

    existing_emails = {u.email for u in db.query(User).filter(User.organization_id == org.id).all()}

    for (fname, lname, dept, unit, level) in USERS:
        full_name = f"{fname} {lname}"
        key = full_name.lower()

        if key in user_lookup:
            u = user_lookup[key]
            # Update password to demo password
            u.password_hash = hashed_pw
            u.must_reset_password = False
            skipped += 1
            tracked.append((u, level, dept, unit))
            continue

        email = make_email(fname, lname)
        base  = email
        n = 1
        while email in existing_emails:
            parts = base.split('@')
            email = f"{parts[0]}{n}@{parts[1]}"
            n += 1
        existing_emails.add(email)

        dept_obj = resolve_dept(dept, unit)
        u = User(
            id=gid(),
            organization_id=org.id,
            name=full_name,
            email=email,
            password_hash=hashed_pw,
            department_id=dept_obj.id if dept_obj else None,
            status=UserStatus.active,
            must_reset_password=False,
        )
        db.add(u)
        user_lookup[key] = u
        existing_emails.add(email)
        tracked.append((u, level, dept, unit))
        created += 1
        print(f"  + {full_name:35s}  {email}")
    db.flush()

    # ── Roles assignment ──────────────────────────────────────────────────────
    for (u, level, dept, unit) in tracked:
        for rname in level_to_flowdesk_roles.get(level.lower(), ["Standard User"]):
            r = role_map.get(rname)
            if not r:
                continue
            exists = db.query(UserRole).filter(UserRole.user_id == u.id, UserRole.role_id == r.id).first()
            if not exists:
                db.add(UserRole(id=gid(), user_id=u.id, role_id=r.id))
    db.flush()

    # ── Hierarchy ─────────────────────────────────────────────────────────────
    for (u, level, dept, unit) in tracked:
        rule = get_hierarchy_rule(dept, unit, level)
        if not rule:
            continue
        mgr = user_lookup.get(rule["mgr"]) if rule.get("mgr") else None
        sm  = user_lookup.get(rule["sm"])  if rule.get("sm")  else None
        hod = user_lookup.get(rule["hod"]) if rule.get("hod") else None
        if mgr: u.manager_id    = mgr.id
        if sm:  u.sn_manager_id = sm.id
        if hod: u.hod_id        = hod.id

    db.commit()

    print(f"\n{'='*60}")
    print(f"  Done!")
    print(f"  Created : {created} users")
    print(f"  Updated : {skipped} existing users (password reset to demo)")
    print(f"  Password: {DEMO_PASSWORD}")
    print(f"  Domain  : @{EMAIL_DOMAIN}")
    print(f"{'='*60}\n")


if __name__ == '__main__':
    main()
