#!/usr/bin/env python3
"""
BSC Rwanda — Users, Departments & Units seeding script.
Run inside the API container:
  docker exec flowdesk-api-1 python3 /app/seed_bsc_users.py
"""
import sys, os
sys.path.insert(0, '/app')

import models.organization, models.user, models.form
import models.approval, models.delegation, models.audit, models.document

from database import SessionLocal
from models.organization import Organization, Department
from models.user import User, Role, UserRole, RoleName, RoleCategory, UserStatus
from passlib.context import CryptContext
import uuid, unicodedata, re

pwd_ctx = CryptContext(schemes=['bcrypt'], deprecated='auto')

def gid(): return str(uuid.uuid4())

def normalize(s):
    """ASCII-safe lowercase, remove accents/punctuation."""
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[^a-zA-Z0-9]", "", s)
    return s.lower()

def make_email(fname, lname):
    f = normalize(fname.split()[0])
    l = normalize(lname.split()[0])
    return f"{f}.{l}@bscrwanda.rw"

# ─────────────────────────────────────────────────────────────────────────────
# Data
# ─────────────────────────────────────────────────────────────────────────────

# (first_name, last_name, department, unit_or_None, level)
# level: CEO | Chief Finance | Chief Commercial | Chief Corporate |
#        Chief Technical | Director of PMO |
#        Senior Manager | Manager | Officer
USERS = [
    # ── CEO Office ────────────────────────────────────────────────────────────
    ("Gilbert",             "Kayinamura",          "CEO Office", None,                          "CEO"),
    ("Christian",           "Mbabazi",             "CEO Office", None,                          "Chief Finance"),
    ("Ndoli",               "Mitali",              "CEO Office", None,                          "Chief Commercial"),
    ("Susan",               "Mutesi",              "CEO Office", None,                          "Chief Corporate"),
    ("Innocent",            "Ruzindana",           "CEO Office", None,                          "Chief Technical"),
    ("Dominique",           "Muhire",              "CEO Office", None,                          "Director of PMO"),
    ("Dennis",              "Kaliisa",             "CEO Office", "Legal",                       "Manager"),
    ("Regis",               "Nkwaya",              "CEO Office", "Auditor",                     "Manager"),

    # ── Technical ─────────────────────────────────────────────────────────────
    ("Philip",              "Mudenge",             "Technical",  None,                          "Senior Manager"),   # TX + Access + Planning Projects
    ("Robert",              "Nkeramugaba",         "Technical",  None,                          "Senior Manager"),   # Cloud + Noc + IP Core
    # — Managers —
    ("Yves",                "Ishema",              "Technical",  "Access",                      "Manager"),
    ("Jean Claude",         "Karemera",            "Technical",  "TX",                          "Manager"),
    ("Joan",                "Mukantagara",         "Technical",  "Planning Projects",           "Manager"),
    ("Richard",             "Buregeya",            "Technical",  "Cloud",                       "Manager"),
    ("Callixte",            "Mugabo",              "Technical",  "Noc",                         "Manager"),
    ("Ingrid",              "Iradukunda",          "Technical",  "IP Core",                     "Manager"),
    ("Denis",               "Rukundo",             "Technical",  "IP Core",                     "Manager"),
    ("Yves",                "Nkaka",               "Technical",  "Security",                    "Manager"),
    # — Access Officers —
    ("Julien",              "Amahirwe",            "Technical",  "Access",                      "Officer"),
    ("Alexis",              "Habarimana",          "Technical",  "Access",                      "Officer"),
    ("Mechack",             "Iradukunda",          "Technical",  "Access",                      "Officer"),
    ("Janvier",             "Kalisa",              "Technical",  "Access",                      "Officer"),
    ("Elimine",             "Kwizera",             "Technical",  "Access",                      "Officer"),
    ("Fabrice",             "Mbera",               "Technical",  "Access",                      "Officer"),
    ("Richard",             "Mucyo",               "Technical",  "Access",                      "Officer"),
    ("Jean Claude",         "Ngoga",               "Technical",  "Access",                      "Officer"),
    ("Fidele",              "Nduhungirehe",        "Technical",  "Access",                      "Officer"),
    ("Gervais",             "Nzayisenga",          "Technical",  "Access",                      "Officer"),
    ("Cyprien",             "Rugambwa",            "Technical",  "Access",                      "Officer"),
    ("Djafari",             "Shema",               "Technical",  "Access",                      "Officer"),
    ("Emmanuel",            "Tuganimana",          "Technical",  "Access",                      "Officer"),
    ("Osee",                "Tuyihimbaze",         "Technical",  "Access",                      "Officer"),
    ("Frank",               "Rutaganira",          "Technical",  "Access",                      "Officer"),
    # — Cloud Officers —
    ("Patrick",             "Muragwa",             "Technical",  "Cloud",                       "Officer"),
    ("Patrick",             "Sengabo",             "Technical",  "Cloud",                       "Officer"),
    # — Noc Officers —
    ("Stella Marlyne",      "Igihozo",             "Technical",  "Noc",                         "Officer"),
    ("Materne",             "Kalingungu",          "Technical",  "Noc",                         "Officer"),
    ("Amza",                "Mbaraga",             "Technical",  "Noc",                         "Officer"),
    ("Blessing",            "Munana",              "Technical",  "Noc",                         "Officer"),
    ("Jean de Dieu",        "Ndahayo",             "Technical",  "Noc",                         "Officer"),
    ("Desire",              "Rutaganira",          "Technical",  "Noc",                         "Officer"),
    ("Brendah",             "Umutoniwase",         "Technical",  "Noc",                         "Officer"),
    # — IP Core Officers —
    ("Jessica",             "Kankundiye",          "Technical",  "IP Core",                     "Officer"),
    ("Elie",                "Nshimiye",            "Technical",  "IP Core",                     "Officer"),
    # — TX Officers —
    ("Joseph",              "Muhire",              "Technical",  "TX",                          "Officer"),
    ("Ernest",              "Nkurunziza",          "Technical",  "TX",                          "Officer"),
    ("Gady",                "Mutangana",           "Technical",  "TX",                          "Officer"),
    # — Planning Projects Officers —
    ("Willy",               "Nyarwaya",            "Technical",  "Planning Projects",           "Officer"),
    # — Security Officers —
    ("Alain",               "Mugisha",             "Technical",  "Security",                    "Officer"),
    ("Joyeuse",             "Tuyishime",           "Technical",  "Security",                    "Officer"),
    ("Mireille",            "Ukeye",               "Technical",  "Security",                    "Officer"),

    # ── Commercial ────────────────────────────────────────────────────────────
    ("Patrick",             "Mugisha",             "Commercial", "Sales",                       "Senior Manager"),
    # — Managers —
    ("Omer",                "Banza",               "Commercial", "Business Expansion",          "Manager"),
    ("Duncan",              "Mugisha",             "Commercial", "Marketing",                   "Manager"),
    ("Alphonsine",          "Mukamana",            "Commercial", "Sales",                       "Manager"),
    ("Jean de Dieu",        "Tuyishime",           "Commercial", "Product Development",         "Manager"),
    # — Marketing Officers —
    ("Raissa",              "Atete",               "Commercial", "Marketing",                   "Officer"),
    ("Sheilla",             "Bazizane",            "Commercial", "Marketing",                   "Officer"),
    # — Sales Officers —
    ("Richard",             "Buntu",               "Commercial", "Sales",                       "Officer"),
    ("Moses",               "Gahigi",              "Commercial", "Sales",                       "Officer"),
    ("Nadia",               "Gasana",              "Commercial", "Sales",                       "Officer"),
    ("Bon Coeur",           "Habiyakare",          "Commercial", "Sales",                       "Officer"),
    ("Hope",                "Kayesu",              "Commercial", "Sales",                       "Officer"),
    ("Denis",               "Kayitare",            "Commercial", "Sales",                       "Officer"),
    ("Germain",             "Musoni",              "Commercial", "Sales",                       "Officer"),
    ("Thamar",              "Niyitegeka",          "Commercial", "Sales",                       "Officer"),
    ("Chris Marie",         "Ngabonziza",          "Commercial", "Sales",                       "Officer"),
    ("Justin",              "Shyaka",              "Commercial", "Sales",                       "Officer"),
    # — Product Development Officers —
    ("Justine",             "Mudahogora",          "Commercial", "Product Development",         "Officer"),

    # ── Corporate ─────────────────────────────────────────────────────────────
    ("Justin",              "Munyampeta",          "Corporate",  "Supply Chain",                "Manager"),
    ("Noella",              "Uwamariya",           "Corporate",  "Admin & HR",                  "Manager"),
    ("Nadege",              "Umutoniwase",         "Corporate",  "HR",                          "Manager"),
    # — Supply Chain Officers —
    ("Papias",              "Bahizi",              "Corporate",  "Supply Chain",                "Officer"),
    ("Alain",               "Iyakaremye",          "Corporate",  "Supply Chain",                "Officer"),
    ("Keneth",              "Murinda",             "Corporate",  "Supply Chain",                "Officer"),
    ("Evelyne",             "Mutunge",             "Corporate",  "Supply Chain",                "Officer"),
    ("Henriette",           "Uwera",               "Corporate",  "Supply Chain",                "Officer"),
    # — Admin & HR Officers —
    ("Grace",               "Batamuliza",          "Corporate",  "Admin & HR",                  "Officer"),
    ("Didas",               "Mugisha",             "Corporate",  "Admin & HR",                  "Officer"),
    ("Christophe",          "Niyimubona",          "Corporate",  "Admin & HR",                  "Officer"),
    ("Jean Marie",          "Rukundo",             "Corporate",  "Admin & HR",                  "Officer"),
    # — HR Officers —
    ("William",             "Manzi",               "Corporate",  "HR",                          "Officer"),

    # ── Finance ───────────────────────────────────────────────────────────────
    ("Felicien",            "Batitonda",           "Finance",    None,                          "Senior Manager"),  # Accounting + Recovery
    ("Daniel",              "Muyoboke",            "Finance",    "Accounting",                  "Manager"),
    ("Vianney",             "Mugabo",              "Finance",    "Recovery",                    "Manager"),
    # — Accounting Officers —
    ("Damascene",           "Ngororano",           "Finance",    "Accounting",                  "Officer"),
    ("Pacifique",           "Nkurunziza",          "Finance",    "Accounting",                  "Officer"),
    ("Cynthia",             "Umulisa",             "Finance",    "Accounting",                  "Officer"),
    # — Recovery Officers —
    ("John",                "Katungi",             "Finance",    "Recovery",                    "Officer"),
    ("Julienne",            "Kayitesi",            "Finance",    "Recovery",                    "Officer"),
    ("Jonas",               "Mihigo",              "Finance",    "Recovery",                    "Officer"),
    ("Alliance",            "Mwangaza",            "Finance",    "Recovery",                    "Officer"),
    ("Theophile",           "Ndacyayisenga",       "Finance",    "Recovery",                    "Officer"),
    ("Doreen",              "Umurungi",            "Finance",    "Recovery",                    "Officer"),
    ("Beatrice",            "Uwamahoro",           "Finance",    "Recovery",                    "Officer"),

    # ── PMO ───────────────────────────────────────────────────────────────────
    ("Shaffy",              "Muhizi",              "PMO",        "Project Sales",               "Senior Manager"),
    ("Alain Cedrick",       "Manzi",               "PMO",        "Project Sales",               "Officer"),
    ("Lydie",               "Kayitesi",            "PMO",        "Project Compliance",          "Officer"),
    ("Brian",               "Manzi",               "PMO",        "Project Compliance",          "Officer"),
    ("Michael",             "Ngamije",             "PMO",        "Project Compliance",          "Officer"),
    ("Emeline",             "Nikuzwe",             "PMO",        "Project Compliance",          "Officer"),
    ("Olivier",             "Niyonshuti",          "PMO",        "Project Compliance",          "Officer"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Hierarchy rules:
# For each (dept, unit), who is the Manager, Senior Manager, HOD?
# ─────────────────────────────────────────────────────────────────────────────

# These are keyed by (full_name_lower) of person → {"role", "dept", "unit", "mgr_key", "sm_key", "hod_key"}
# We'll resolve by name lookup after user creation.

HIERARCHY = {
    # Technical units ──────────────────────────────────────────────────────────
    # Access
    ("technical", "access", "officer"):       {"mgr": "yves ishema",       "sm": "philip mudenge",    "hod": "innocent ruzindana"},
    ("technical", "access", "manager"):       {"mgr": "philip mudenge",    "sm": None,                 "hod": "innocent ruzindana"},
    # TX
    ("technical", "tx", "officer"):           {"mgr": "jean claude karemera", "sm": "philip mudenge", "hod": "innocent ruzindana"},
    ("technical", "tx", "manager"):           {"mgr": "philip mudenge",    "sm": None,                 "hod": "innocent ruzindana"},
    # Planning Projects
    ("technical", "planning projects", "officer"): {"mgr": "joan mukantagara", "sm": "philip mudenge", "hod": "innocent ruzindana"},
    ("technical", "planning projects", "manager"): {"mgr": "philip mudenge",   "sm": None,              "hod": "innocent ruzindana"},
    # Cloud
    ("technical", "cloud", "officer"):        {"mgr": "richard buregeya",  "sm": "robert nkeramugaba","hod": "innocent ruzindana"},
    ("technical", "cloud", "manager"):        {"mgr": "robert nkeramugaba","sm": None,                 "hod": "innocent ruzindana"},
    # Noc
    ("technical", "noc", "officer"):          {"mgr": "callixte mugabo",   "sm": "robert nkeramugaba","hod": "innocent ruzindana"},
    ("technical", "noc", "manager"):          {"mgr": "robert nkeramugaba","sm": None,                 "hod": "innocent ruzindana"},
    # IP Core
    ("technical", "ip core", "officer"):      {"mgr": "ingrid iradukunda", "sm": "robert nkeramugaba","hod": "innocent ruzindana"},
    ("technical", "ip core", "manager"):      {"mgr": "robert nkeramugaba","sm": None,                 "hod": "innocent ruzindana"},
    # Security
    ("technical", "security", "officer"):     {"mgr": "yves nkaka",        "sm": "innocent ruzindana","hod": "innocent ruzindana"},
    ("technical", "security", "manager"):     {"mgr": "innocent ruzindana","sm": None,                 "hod": "innocent ruzindana"},
    # Senior Managers in Technical
    ("technical", None, "senior manager"):    {"mgr": "innocent ruzindana","sm": None,                 "hod": "innocent ruzindana"},

    # Commercial units ─────────────────────────────────────────────────────────
    ("commercial", "sales", "officer"):       {"mgr": "alphonsine mukamana","sm": "patrick mugisha",  "hod": "ndoli mitali"},
    ("commercial", "sales", "manager"):       {"mgr": "patrick mugisha",   "sm": None,                "hod": "ndoli mitali"},
    ("commercial", "sales", "senior manager"):{"mgr": "ndoli mitali",      "sm": None,                "hod": "ndoli mitali"},
    ("commercial", "marketing", "officer"):   {"mgr": "duncan mugisha",    "sm": "ndoli mitali",      "hod": "ndoli mitali"},
    ("commercial", "marketing", "manager"):   {"mgr": "ndoli mitali",      "sm": None,                "hod": "ndoli mitali"},
    ("commercial", "business expansion", "officer"): {"mgr": "omer banza", "sm": "ndoli mitali",      "hod": "ndoli mitali"},
    ("commercial", "business expansion", "manager"):  {"mgr": "ndoli mitali","sm": None,              "hod": "ndoli mitali"},
    ("commercial", "product development", "officer"): {"mgr": "jean de dieu tuyishime","sm": "ndoli mitali","hod": "ndoli mitali"},
    ("commercial", "product development", "manager"): {"mgr": "ndoli mitali","sm": None,              "hod": "ndoli mitali"},

    # Corporate units ──────────────────────────────────────────────────────────
    ("corporate", "supply chain", "officer"): {"mgr": "justin munyampeta", "sm": "susan mutesi",      "hod": "susan mutesi"},
    ("corporate", "supply chain", "manager"): {"mgr": "susan mutesi",      "sm": None,                "hod": "susan mutesi"},
    ("corporate", "admin & hr", "officer"):   {"mgr": "noella uwamariya",  "sm": "susan mutesi",      "hod": "susan mutesi"},
    ("corporate", "admin & hr", "manager"):   {"mgr": "susan mutesi",      "sm": None,                "hod": "susan mutesi"},
    ("corporate", "hr", "officer"):           {"mgr": "nadege umutoniwase","sm": "susan mutesi",      "hod": "susan mutesi"},
    ("corporate", "hr", "manager"):           {"mgr": "susan mutesi",      "sm": None,                "hod": "susan mutesi"},

    # Finance units ────────────────────────────────────────────────────────────
    ("finance", "accounting", "officer"):     {"mgr": "daniel muyoboke",   "sm": "felicien batitonda","hod": "christian mbabazi"},
    ("finance", "accounting", "manager"):     {"mgr": "felicien batitonda","sm": None,                "hod": "christian mbabazi"},
    ("finance", "recovery", "officer"):       {"mgr": "vianney mugabo",    "sm": "felicien batitonda","hod": "christian mbabazi"},
    ("finance", "recovery", "manager"):       {"mgr": "felicien batitonda","sm": None,                "hod": "christian mbabazi"},
    ("finance", None, "senior manager"):      {"mgr": "christian mbabazi", "sm": None,                "hod": "christian mbabazi"},

    # PMO units ────────────────────────────────────────────────────────────────
    ("pmo", "project sales", "officer"):      {"mgr": "shaffy muhizi",     "sm": "dominique muhire",  "hod": "dominique muhire"},
    ("pmo", "project sales", "senior manager"):{"mgr": "dominique muhire", "sm": None,                "hod": "dominique muhire"},
    ("pmo", "project compliance", "officer"): {"mgr": "shaffy muhizi",     "sm": "dominique muhire",  "hod": "dominique muhire"},

    # CEO Office ───────────────────────────────────────────────────────────────
    ("ceo office", "legal", "manager"):       {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
    ("ceo office", "auditor", "manager"):     {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
    # Chiefs report to CEO
    ("ceo office", None, "chief finance"):    {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief commercial"): {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief corporate"):  {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
    ("ceo office", None, "chief technical"):  {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
    ("ceo office", None, "director of pmo"):  {"mgr": "gilbert kayinamura","sm": None,                "hod": "gilbert kayinamura"},
}

def get_hierarchy_key(dept, unit, level):
    d = dept.lower() if dept else None
    u = unit.lower() if unit else None
    l = level.lower()
    key = (d, u, l)
    if key in HIERARCHY:
        return HIERARCHY[key]
    # Try without unit
    key2 = (d, None, l)
    if key2 in HIERARCHY:
        return HIERARCHY[key2]
    return None


def main():
    db = SessionLocal()
    org = db.query(Organization).first()
    if not org:
        print("ERROR: No organization found.")
        return

    print(f"\n{'='*60}")
    print(f"  BSC Rwanda Seed Script")
    print(f"  Organization: {org.name}")
    print(f"{'='*60}\n")

    DEFAULT_PASSWORD = "BSCRwanda@2024"
    hashed_pw = pwd_ctx.hash(DEFAULT_PASSWORD)

    # ── 1. Ensure roles exist ─────────────────────────────────────────────────
    print("Step 1: Creating roles...")
    role_defs = [
        (RoleName.admin,         RoleCategory.system,    "System Administrator — full access"),
        (RoleName.standard_user, RoleCategory.system,    "Standard user — can submit forms"),
        (RoleName.observer,      RoleCategory.system,    "Read-only observer"),
        (RoleName.manager,       RoleCategory.hierarchy, "Unit Manager"),
        (RoleName.sn_manager,    RoleCategory.hierarchy, "Senior Manager"),
        (RoleName.hod,           RoleCategory.hierarchy, "Head of Department / Chief / Director"),
        (RoleName.ceo,           RoleCategory.executive, "Chief Executive Officer"),
    ]
    role_map = {}
    for rname, rcat, rdesc in role_defs:
        r = db.query(Role).filter(Role.organization_id == org.id, Role.name == rname.value).first()
        if not r:
            r = Role(id=gid(), organization_id=org.id, name=rname.value,
                     role_category=rcat, description=rdesc, is_active=True)
            db.add(r)
            print(f"  Created role: {rname.value}")
        role_map[rname.value] = r
    db.flush()

    # ── 2. Create departments (top-level) ─────────────────────────────────────
    print("\nStep 2: Creating departments...")
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
            print(f"  Created department: {dname}")
        dept_map[dname] = dept
    db.flush()

    # ── 3. Create units (sub-departments) ─────────────────────────────────────
    print("\nStep 3: Creating units...")
    units_def = {
        'CEO Office':  ['Legal', 'Auditor'],
        'Technical':   ['Access', 'TX', 'Planning Projects', 'Cloud', 'Noc', 'IP Core', 'Security'],
        'Commercial':  ['Sales', 'Marketing', 'Business Expansion', 'Product Development'],
        'Corporate':   ['Supply Chain', 'Admin & HR', 'HR'],
        'Finance':     ['Accounting', 'Recovery'],
        'PMO':         ['Project Compliance', 'Project Sales'],
    }
    unit_map = {}  # "Dept/Unit" -> Department obj
    for dept_name, ulist in units_def.items():
        parent = dept_map[dept_name]
        for uname in ulist:
            key = f"{dept_name}/{uname}"
            unit = db.query(Department).filter(
                Department.organization_id == org.id,
                Department.name == uname,
                Department.parent_department_id == parent.id
            ).first()
            if not unit:
                unit = Department(id=gid(), organization_id=org.id, name=uname,
                                   parent_department_id=parent.id, is_active=True)
                db.add(unit)
                print(f"  Created unit: {dept_name} → {uname}")
            unit_map[key] = unit
    db.flush()

    def resolve_dept_obj(dept_name, unit_name):
        """Return the most specific department object for a user."""
        if unit_name:
            key = f"{dept_name}/{unit_name}"
            if key in unit_map:
                return unit_map[key]
        return dept_map.get(dept_name)

    # ── 4. Create users ────────────────────────────────────────────────────────
    print("\nStep 4: Creating users...")
    created = 0
    skipped = 0
    user_lookup = {}  # lower_full_name -> User (built as we create)

    # Pre-load existing users
    for u in db.query(User).filter(User.organization_id == org.id).all():
        user_lookup[u.name.lower()] = u

    level_to_role = {
        "ceo":              "CEO",
        "chief finance":    "HOD",
        "chief commercial": "HOD",
        "chief corporate":  "HOD",
        "chief technical":  "HOD",
        "director of pmo":  "HOD",
        "senior manager":   "SN Manager",
        "manager":          "Manager",
        "officer":          "Standard User",
    }

    new_users = []  # (User obj, level, dept, unit)

    for (fname, lname, dept, unit, level) in USERS:
        full_name = f"{fname} {lname}"
        name_key  = full_name.lower()

        # Skip if already exists
        if name_key in user_lookup:
            existing = user_lookup[name_key]
            skipped += 1
            new_users.append((existing, level, dept, unit))
            continue

        email = make_email(fname, lname)
        # Handle email collisions
        base_email = email
        counter = 1
        existing_emails = {u.email for u in db.query(User.email).filter(
            User.organization_id == org.id).all()} if counter == 1 else set()
        while email in existing_emails:
            parts = base_email.split('@')
            email = f"{parts[0]}{counter}@{parts[1]}"
            counter += 1

        dept_obj = resolve_dept_obj(dept, unit)

        user_role_name = "Admin" if level.lower() == "ceo" else level_to_role.get(level.lower(), "Standard User")

        u = User(
            id=gid(),
            organization_id=org.id,
            name=full_name,
            email=email,
            password_hash=hashed_pw,
            department_id=dept_obj.id if dept_obj else None,
            status=UserStatus.active,
            must_reset_password=True,
        )
        db.add(u)
        user_lookup[name_key] = u
        new_users.append((u, level, dept, unit))
        created += 1
        print(f"  + {full_name:35s}  {level:20s}  {dept}/{unit or '-'}")

    db.flush()

    # ── 5. Assign roles ────────────────────────────────────────────────────────
    print("\nStep 5: Assigning roles...")
    for (u, level, dept, unit) in new_users:
        lvl_lower = level.lower()
        # Determine FlowDesk role
        if lvl_lower == "ceo":
            role_names = ["Admin", "HOD", "CEO"]
        elif lvl_lower in ("chief finance", "chief commercial", "chief corporate",
                           "chief technical", "director of pmo"):
            role_names = ["HOD"]
        elif lvl_lower == "senior manager":
            role_names = ["SN Manager"]
        elif lvl_lower == "manager":
            role_names = ["Manager"]
        else:
            role_names = ["Standard User"]

        for rname in role_names:
            if rname not in role_map:
                continue
            role_obj = role_map[rname]
            exists = db.query(UserRole).filter(
                UserRole.user_id == u.id,
                UserRole.role_id == role_obj.id
            ).first()
            if not exists:
                db.add(UserRole(id=gid(), user_id=u.id, role_id=role_obj.id))

    db.flush()

    # ── 6. Set hierarchy (manager, sn_manager, hod) ───────────────────────────
    print("\nStep 6: Setting approval hierarchy...")

    def find_user(name_lower):
        return user_lookup.get(name_lower)

    hierarchy_set = 0
    hierarchy_skip = 0

    for (u, level, dept, unit) in new_users:
        rule = get_hierarchy_key(dept, unit, level)
        if not rule:
            hierarchy_skip += 1
            continue

        mgr_name = rule.get("mgr")
        sm_name  = rule.get("sm")
        hod_name = rule.get("hod")

        mgr = find_user(mgr_name) if mgr_name else None
        sm  = find_user(sm_name)  if sm_name  else None
        hod = find_user(hod_name) if hod_name else None

        changed = False
        if mgr and u.manager_id != mgr.id:
            u.manager_id = mgr.id; changed = True
        if sm and u.sn_manager_id != sm.id:
            u.sn_manager_id = sm.id; changed = True
        if hod and u.hod_id != hod.id:
            u.hod_id = hod.id; changed = True

        if changed:
            hierarchy_set += 1
            print(f"  {u.name:35s}  mgr={mgr.name if mgr else '-':25s}  "
                  f"sm={sm.name if sm else '-':25s}  hod={hod.name if hod else '-'}")

    db.commit()
    print(f"\n{'='*60}")
    print(f"  DONE!")
    print(f"  Users created : {created}")
    print(f"  Users skipped : {skipped} (already existed)")
    print(f"  Hierarchy set : {hierarchy_set}")
    print(f"  Default password: {DEFAULT_PASSWORD}")
    print(f"  All users must reset password on first login.")
    print(f"{'='*60}\n")

if __name__ == '__main__':
    main()
