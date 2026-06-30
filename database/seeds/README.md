# FlowDesk — Database Seeds

Idempotent seed data for the FlowDesk approval workflow platform.
All scripts use `ON DUPLICATE KEY UPDATE` and are safe to re-run.

## Execution Order

Run files in numerical order.

| # | File | Contents |
|---|------|----------|
| 001 | `001_organizations.sql` | Organisation, top-level departments, sub-units |
| 002 | `002_roles.sql` | System, hierarchy, functional, and executive roles |

> The former demo data seeds (users, role assignments, form definitions,
> approval templates, and demo form instances) have been removed because they
> carried a shared, hardcoded demo password. Create real accounts through the
> app's admin UI instead — the bootstrap admin is provisioned at startup from
> `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (see `.env.example`).

## Running the Seeds

### MySQL CLI
```bash
mysql -u <user> -p <database> < database/seeds/001_organizations.sql
mysql -u <user> -p <database> < database/seeds/002_roles.sql
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
