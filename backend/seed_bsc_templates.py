#!/usr/bin/env python3
"""
BSC Rwanda — Form Definitions & Approval Templates seed.

Creates the 10 canonical forms (one per request type) plus their approval
templates. Replaces the old "duplicate per unit" model — same form, different
chain depending on who initiates (resolved via Hierarchy/Functional/Executive
steps at submission time).

Run inside the API container:
  docker exec flowdesk-api python3 /app/seed_bsc_templates.py

Idempotent: re-running skips records that already exist.
"""
import sys, os
sys.path.insert(0, '/app')

import models.organization, models.user, models.form
import models.approval, models.delegation, models.audit, models.document

from database import SessionLocal
from models.organization import Organization
from models.user import User, Role, UserRole, RoleCategory
from models.approval import (
    ApprovalTemplate, ApprovalTemplateStep,
    ApprovalTemplateCCRecipient, RoleType
)
from models.form import FormDefinition, FormVisibility
import uuid


def gid():
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# Roles that the 10 templates depend on. Created if missing. Admin can
# assign users to them via Admin → Users → Approval Roles.
# ─────────────────────────────────────────────────────────────────────────────
REQUIRED_ROLES = [
    # (name, category, description)
    ("Logistics",                 RoleCategory.functional, "Logistics / store keeper"),
    ("Supply Chain",              RoleCategory.functional, "Supply Chain function"),
    ("HR",                        RoleCategory.functional, "Human Resources"),
    ("HR & Admin",                RoleCategory.functional, "HR & Administration"),
    ("Accounting",                RoleCategory.functional, "Accounting / finance ops"),
    ("CFO",                       RoleCategory.executive,  "Chief Finance Officer"),
    ("CEO",                       RoleCategory.executive,  "Chief Executive Officer"),
    ("Chief Corporate Officer",   RoleCategory.executive,  "Chief Corporate Officer"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Forms — (name, code_suffix, description). Department-based visibility is set
# per-form in the admin UI; role-based initiator gatekeeping was removed.
# ─────────────────────────────────────────────────────────────────────────────
FORMS = [
    ("Stock Requisition Form",              "STK", "Request stock items from internal store"),
    ("Purchase Requisition Form",           "PRQ", "Request procurement of goods or services"),
    ("Petty Cash Voucher Form",             "PCV", "Request small cash disbursement"),
    ("Refund Form",                         "REF", "Request reimbursement for out-of-pocket spend"),
    ("Salary Advance Form",                 "SAL", "Request salary advance payment"),
    ("Training Request Form",               "TRN", "Request training authorisation"),
    ("Mission Allowance Form",              "MAL", "Local mission / field visit allowance"),
    ("Site Report",                         "SR",  "Field / site visit report"),
    ("Mission Allowance International",     "MAI", "International mission allowance"),
    ("Mission Authorization International", "MAU", "International mission authorisation"),
]


# ─────────────────────────────────────────────────────────────────────────────
# Templates — keyed by form code_suffix.
# Each step is (step_order, label, role_type, target)
#   role_type ∈ {"Hierarchy", "Functional", "Executive"}
#   target = "manager" | "sn_manager" | "hod" for Hierarchy
#          = role name string for Functional / Executive
# CC recipients = list of ("role", role_name) | ("email", "addr@x.com")
# ─────────────────────────────────────────────────────────────────────────────
TEMPLATES = {
    "STK": {
        "name": "Stock Requisition Approval",
        "steps": [
            (1, "Logistics Review",         "Functional", "Logistics"),
            (2, "Line Manager Approval",    "Hierarchy",  "manager"),
            (3, "Senior Manager Approval",  "Hierarchy",  "sn_manager"),
            (4, "Supply Chain Approval",    "Functional", "Supply Chain"),
        ],
        "cc": [("role", "Logistics")],
    },
    "PRQ": {
        "name": "Purchase Requisition Approval",
        "steps": [
            (1, "Line Manager Approval",    "Hierarchy", "manager"),
            (2, "Senior Manager Approval",  "Hierarchy", "sn_manager"),
            (3, "HOD Approval",             "Hierarchy", "hod"),
            (4, "CFO Approval",             "Executive", "CFO"),
            (5, "CEO Approval",             "Executive", "CEO"),
        ],
        "cc": [("role", "Accounting")],
    },
    "PCV": {
        "name": "Petty Cash Voucher Approval",
        "steps": [
            (1, "Line Manager Approval",    "Hierarchy",  "manager"),
            (2, "Accounting Approval",      "Functional", "Accounting"),
        ],
        "cc": [("role", "Accounting")],
    },
    "REF": {
        "name": "Refund Approval",
        "steps": [
            (1, "Line Manager Approval", "Hierarchy", "manager"),
            (2, "CFO Approval",          "Executive", "CFO"),
            (3, "CEO Approval",          "Executive", "CEO"),
        ],
        "cc": [("role", "Accounting")],
    },
    "SAL": {
        "name": "Salary Advance Approval",
        "steps": [
            (1, "HR & Admin Review",                "Functional", "HR & Admin"),
            (2, "Chief Corporate Officer Approval", "Executive",  "Chief Corporate Officer"),
            (3, "CFO Approval",                     "Executive",  "CFO"),
            (4, "CEO Approval",                     "Executive",  "CEO"),
        ],
        "cc": [("role", "Accounting")],
    },
    "TRN": {
        "name": "Training Request Approval",
        "steps": [
            (1, "HR Review",                        "Functional", "HR"),
            (2, "Line Manager Approval",            "Hierarchy",  "manager"),
            (3, "HOD Approval",                     "Hierarchy",  "hod"),
            (4, "Chief Corporate Officer Approval", "Executive",  "Chief Corporate Officer"),
        ],
        "cc": [],
    },
    "MAL": {
        "name": "Mission Allowance Approval",
        "steps": [
            (1, "Line Manager Approval",   "Hierarchy", "manager"),
            (2, "Senior Manager Approval", "Hierarchy", "sn_manager"),
            (3, "HOD Approval",            "Hierarchy", "hod"),
            (4, "CFO Approval",            "Executive", "CFO"),
        ],
        "cc": [],
    },
    "SR": {
        "name": "Site Report Approval",
        "steps": [
            (1, "Line Manager Approval", "Hierarchy", "manager"),
        ],
        "cc": [],
    },
    "MAI": {
        "name": "Mission Allowance International Approval",
        "steps": [
            (1, "Chief Corporate Officer Approval", "Executive", "Chief Corporate Officer"),
            (2, "CFO Approval",                     "Executive", "CFO"),
            (3, "CEO Approval",                     "Executive", "CEO"),
        ],
        "cc": [],
    },
    "MAU": {
        "name": "Mission Authorization International Approval",
        "steps": [
            (1, "Chief Corporate Officer Approval", "Executive", "Chief Corporate Officer"),
            (2, "CFO Approval",                     "Executive", "CFO"),
            (3, "CEO Approval",                     "Executive", "CEO"),
        ],
        "cc": [],
    },
}


def main():
    db = SessionLocal()
    org = db.query(Organization).filter(Organization.email_domain == 'bsc.rw').first()
    if not org:
        org = db.query(Organization).filter(Organization.subdomain != 'demo').first()
    if not org:
        print("ERROR: No BSC organisation found.")
        return

    # Pick an admin user as created_by — needed for FormDefinition.created_by
    admin_user = (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(User.organization_id == org.id, Role.name == "Admin")
        .first()
    )
    if not admin_user:
        admin_user = db.query(User).filter(User.organization_id == org.id).first()
    if not admin_user:
        print("ERROR: No users found in org. Run seed_bsc_users.py first.")
        return

    print(f"\n{'='*70}")
    print(f"  FlowDesk Template Seed — {org.name}")
    print(f"  Acting as: {admin_user.name}")
    print(f"{'='*70}\n")

    # ── 1. Ensure required approval roles exist ──────────────────────────────
    print("Step 1: Ensuring approval roles exist...")
    role_lookup = {}
    for rname, rcat, rdesc in REQUIRED_ROLES:
        r = db.query(Role).filter(
            Role.organization_id == org.id,
            Role.name == rname
        ).first()
        if not r:
            r = Role(
                id=gid(), organization_id=org.id, name=rname,
                role_category=rcat, description=rdesc, is_active=True
            )
            db.add(r)
            print(f"  + role: {rname}  ({rcat.value})")
        role_lookup[rname] = r
    db.flush()

    # ── 2. Create form definitions ──────────────────────────────────────────
    print("\nStep 2: Creating form definitions...")
    form_by_suffix = {}
    for fname, suffix, fdesc in FORMS:
        existing = db.query(FormDefinition).filter(
            FormDefinition.organization_id == org.id,
            FormDefinition.code_suffix == suffix,
            FormDefinition.is_active == True
        ).first()
        if existing:
            print(f"  · {suffix}  exists — {existing.name}")
            form_by_suffix[suffix] = existing
            continue
        f = FormDefinition(
            id=gid(),
            organization_id=org.id,
            name=fname,
            description=fdesc,
            code_suffix=suffix,
            visibility=FormVisibility.all_users,
            allow_backdating=False,
            allow_attachments=True,
            is_active=True,
            created_by=admin_user.id,
        )
        db.add(f)
        form_by_suffix[suffix] = f
        print(f"  + {suffix}  {fname}")
    db.flush()

    # ── 3. Create approval templates + steps + CC recipients ────────────────
    print("\nStep 3: Creating approval templates...")
    for suffix, tdef in TEMPLATES.items():
        form_def = form_by_suffix.get(suffix)
        if not form_def:
            print(f"  ! {suffix}: form not found, skipping")
            continue

        # Skip if template already attached to this form
        if form_def.approval_template_id:
            existing_tpl = db.query(ApprovalTemplate).filter(
                ApprovalTemplate.id == form_def.approval_template_id
            ).first()
            if existing_tpl:
                print(f"  · {suffix}  template exists — {existing_tpl.name}")
                continue

        tpl = ApprovalTemplate(
            id=gid(),
            organization_id=org.id,
            name=tdef["name"],
            description=f"Auto-seeded template for {form_def.name}",
            restart_on_correction=True,
            is_active=True,
            created_by=admin_user.id,
        )
        db.add(tpl)
        db.flush()

        # Steps
        for order, label, role_type_str, target in tdef["steps"]:
            rt = RoleType(role_type_str)
            step = ApprovalTemplateStep(
                id=gid(),
                template_id=tpl.id,
                step_order=order,
                step_label=label,
                role_type=rt,
                skip_if_missing=False,
                delegation_allowed=True,
            )
            if rt == RoleType.hierarchy:
                step.hierarchy_level = target
            elif rt in (RoleType.functional, RoleType.executive):
                role = role_lookup.get(target)
                if not role:
                    print(f"  ! {suffix} step {order}: role '{target}' not in lookup, skipping step")
                    continue
                step.role_id = role.id
            db.add(step)

        # CC recipients
        for cc_type, cc_value in tdef["cc"]:
            cc = ApprovalTemplateCCRecipient(
                id=gid(),
                template_id=tpl.id,
                label=cc_value,
            )
            if cc_type == "role":
                role = role_lookup.get(cc_value)
                if not role:
                    print(f"  ! {suffix} CC: role '{cc_value}' not in lookup, skipping CC")
                    continue
                # Use the role's category to set role_type (functional or executive)
                if role.role_category == RoleCategory.executive:
                    cc.role_type = RoleType.executive
                else:
                    cc.role_type = RoleType.functional
                cc.role_id = role.id
            elif cc_type == "email":
                cc.role_type = RoleType.email
                cc.email = cc_value
            db.add(cc)

        # Link template to form
        form_def.approval_template_id = tpl.id
        print(f"  + {suffix}  {tdef['name']}  ({len(tdef['steps'])} steps, {len(tdef['cc'])} cc)")

    db.commit()
    print(f"\n{'='*70}")
    print(f"  DONE.")
    print(f"  Roles ensured : {len(REQUIRED_ROLES)}")
    print(f"  Forms ensured : {len(FORMS)}")
    print(f"  Templates     : {len(TEMPLATES)}")
    print(f"{'='*70}")
    print("\nNext steps:")
    print("  1. Assign at least one user to each of: Logistics, Supply Chain,")
    print("     HR, HR & Admin, Accounting, CFO, CEO, Chief Corporate Officer")
    print("     via Admin → Users → Edit user → Roles.")
    print("  2. Test-submit each form as a non-admin user.")
    print("  3. Archive the old per-unit duplicated forms via Admin → Forms.\n")


if __name__ == '__main__':
    main()
