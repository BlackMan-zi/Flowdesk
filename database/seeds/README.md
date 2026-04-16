# FlowDesk — Database Seeds

Idempotent seed data for the FlowDesk approval workflow platform.
All scripts use `ON DUPLICATE KEY UPDATE` and are safe to re-run.

## Execution Order

Run files in numerical order. Each file depends on the one before it.

| # | File | Contents |
|---|------|----------|
| 001 | `001_organizations.sql` | Organisation, top-level departments, sub-units |
| 002 | `002_roles.sql` | System, hierarchy, functional, and executive roles |
| 003 | `003_users.sql` | Staff accounts (BSC Rwanda), hierarchy links |
| 004 | `004_user_roles.sql` | User → role assignments |
| 005 | `005_form_definitions.sql` | Form templates and their fields |
| 006 | `006_approval_templates.sql` | Approval workflow chains, CC recipients |
| 007 | `007_form_instances_demo.sql` | Demo submissions, approval steps, audit logs |

## Running the Seeds

### MySQL CLI
```bash
mysql -u <user> -p <database> < database/seeds/001_organizations.sql
mysql -u <user> -p <database> < database/seeds/002_roles.sql
# … repeat in order through 007
```

### Single command (bash)
```bash
for f in database/seeds/*.sql; do
  mysql -u <user> -p<password> <database> < "$f"
done
```

### Docker Compose
```bash
docker compose exec db bash -c \
  "for f in /seeds/*.sql; do mysql -u root -proot flowdesk < \$f; done"
```

## Demo Credentials

All seeded users share the same demo password:

| Password | Hash algorithm |
|----------|----------------|
| `FlowDesk@2024` | bcrypt 12 rounds |

### Key demo accounts

| Email | Role | Notes |
|-------|------|-------|
| `gilbert.kayinamura@bsc.demo` | Admin / CEO | Full system access |
| `christian.mbabazi@bsc.demo` | CFO / HOD | Finance executive approver |
| `noella.uwamariya@bsc.demo` | HR & Admin Manager | HR approval steps |
| `justin.munyampeta@bsc.demo` | Supply Chain Manager | Procurement steps |
| `felicien.batitonda@bsc.demo` | Finance SN Manager | Finance approval steps |
| `nadege.umutoniwase@bsc.demo` | HR Manager | Line manager for William Manzi |
| `william.manzi@bsc.demo` | Standard User | Initiator-only account |

## Demo Form Instances

| Reference | Form Type | Status | Initiator |
|-----------|-----------|--------|-----------|
| BSC-LEAVE-2026-001 | Leave Request | **Completed** | William Manzi |
| BSC-LEAVE-2026-002 | Leave Request | **Completed** | Yves Ishema |
| BSC-LEAVE-2026-003 | Leave Request | **Draft** | Vianney Mugabo |
| BSC-PROC-2026-001 | Purchase Requisition | **Completed** | Richard Buregeya |
| BSC-PROC-2026-002 | Purchase Requisition | **Pending** (step 1) | Callixte Mugabo |
| BSC-PROC-2026-003 | Purchase Requisition | **Rejected** | Dennis Kaliisa |
| BSC-TRAVEL-2026-001 | Travel Authorisation | **Pending** (step 2) | Joan Mukantagara |
| BSC-EXP-2026-001 | Expense Claim | **Completed** | Jean Claude Karemera |
| BSC-EXP-2026-002 | Expense Claim | **Returned for Correction** | Yves Nkaka |
| BSC-OT-2026-001 | Overtime Authorisation | **Pending** (step 2) | Ingrid Iradukunda |
| BSC-ASSET-2026-001 | Asset Requisition | **Draft** | William Manzi |

## Approval Workflow Summary

| Form | Chain |
|------|-------|
| Leave Request | Manager → HR & Admin → HOD |
| Purchase Requisition | Manager → SN Manager* → Supply Chain → HOD → Finance |
| Travel Authorisation | Manager → HOD → CFO |
| Expense Claim | Manager → HOD → Finance |
| Overtime Authorisation | Manager → HOD |
| Asset Requisition | Manager → Supply Chain → HOD |

\* SN Manager step has `skip_if_missing = true` (skipped when the initiator's
   manager is also the senior manager, e.g. for HOD-level initiators).

## Schema Reference

### Key tables

| Table | Description |
|-------|-------------|
| `organizations` | Tenant root |
| `departments` | Org chart nodes (supports parent/child) |
| `users` | Staff accounts with `manager_id` / `hod_id` hierarchy links |
| `roles` | Named roles (System / Hierarchy / Functional / Executive) |
| `user_roles` | Many-to-many user ↔ role |
| `form_definitions` | Form templates |
| `form_fields` | Field definitions per form template |
| `approval_templates` | Workflow chain definitions |
| `approval_template_steps` | Ordered steps within a workflow |
| `approval_template_cc_recipients` | Notify-only recipients |
| `form_instances` | Submitted form records |
| `form_versions` | Immutable snapshots of a form at each submission |
| `form_field_values` | Field data per version |
| `approval_instances` | Per-step approval state for each form version |
| `audit_logs` | Immutable event trail |

### Role type enum values

| Value | Meaning |
|-------|---------|
| `Hierarchy` | Resolved from submitter's org chart (`manager_id` / `hod_id`) |
| `Functional` | Resolved from `role_id` system role |
| `Executive` | Resolved from `role_id` executive role |
| `SpecificUser` | Fixed user from `specific_user_id` |
| `SelectedAtSubmission` | Initiator picks approver at submit time |

### Form / approval status values

**FormStatus:** `Draft` · `Submitted` · `Pending` · `Returned for Correction` · `Rejected` · `Approved` · `Completed`

**ApprovalStepStatus:** `Waiting` · `Active` · `Approved` · `Rejected` · `Sent Back` · `Skipped`
