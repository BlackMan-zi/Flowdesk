# FlowDesk: Page Use Cases & Data Flow

**Version:** 1.0
**Date:** 2026-05-19
**Audience:** Implementation team, QA, training, support
**Companion to:** [`FLOWDESK_BLUEPRINT.md`](FLOWDESK_BLUEPRINT.md)

> For every page in the FlowDesk frontend (`frontend/src/pages/`), this document records:
> - **Use case:** who it is for and why it exists
> - **What it does:** the UI behaviour
> - **Data IN:** which API endpoints feed it, which database tables those ultimately read from
> - **Data OUT:** which API endpoints it calls back, which database tables those mutate
>
> Notation: arrows like `GET /forms/instances → form_instances` mean "the page calls this HTTP endpoint, which reads from this table". Mutations go the other direction.

---

## Table of Contents

### Authentication
1. [Login](#1-login)
2. [ForcePasswordReset](#2-forcepasswordreset)

### User-facing pages
3. [Dashboard (role router)](#3-dashboard-role-router)
4. [MyForms](#4-myforms)
5. [SubmitForm (new / edit)](#5-submitform-new--edit)
6. [FormDetail](#6-formdetail)
7. [ApprovalsInbox](#7-approvalsinbox)
8. [ApprovalAction](#8-approvalaction)
9. [Delegations](#9-delegations)
10. [Documents](#10-documents)
11. [Logs](#11-logs)

### Dashboard variants (`pages/dashboards/`)
12. [AdminDashboard](#12-dashboards-admindashboard)
13. [ReportManagerDashboard](#13-dashboards-reportmanagerdashboard)
14. [ExecutiveDashboard](#14-dashboards-executivedashboard)
15. [HodDashboard](#15-dashboards-hoddashboard)
16. [ApproverDashboard](#16-dashboards-approverdashboard)
17. [InitiatorDashboard](#17-dashboards-initiatordashboard)
18. [ObserverDashboard](#18-dashboards-observerdashboard)

### Admin pages (`pages/admin/`)
19. [Users](#19-admin-users)
20. [Departments](#20-admin-departments)
21. [FormDefinitions](#21-admin-formdefinitions)
22. [FormBuilder](#22-admin-formbuilder)
23. [FormDesigner](#23-admin-formdesigner)
24. [ApprovalTemplates](#24-admin-approvaltemplates)
25. [Delegations (admin view)](#25-admin-delegations)
26. [Settings](#26-admin-settings)

### Appendix
- [Page → Endpoint → Table cheat-sheet](#appendix-page--endpoint--table-cheat-sheet)

---

## 1. Login

| | |
|---|---|
| **Route** | `/login` |
| **Guard** | Public (no auth) |
| **File** | `pages/Login.jsx` |

**Use case:** The front door. Every user (initiator, approver, admin, executive) starts here. Auto-detects organisation from the email domain so users don't pick a tenant.

**What it does**
- Email + password form. Optional TOTP code field appears after first 401-with-mfa response.
- On success, stores JWT in `localStorage.fd_token` and the user profile in `localStorage.fd_user`.
- Redirects to `/force-reset-password` if `must_reset_password` is true, otherwise to `/`.
- "Forgot password?" link triggers the reset-token email.

**Data IN**
- `POST /auth/login` → reads `users` (by email + password hash) and `organizations` (matched via `email_domain`).
- `GET /auth/me` (after login) → reads `users` + `user_roles` + `roles` + `departments`.

**Data OUT**
- `POST /auth/login` → writes `audit_logs` (action `LOGIN_SUCCESS` / `LOGIN_FAILED`); updates `users.last_login`.
- `POST /auth/forgot-password` → writes `password_reset_tokens`; queues email via `email_service`.
- `POST /auth/mfa/verify` → reads `users.mfa_secret`; on success completes login.

---

## 2. ForcePasswordReset

| | |
|---|---|
| **Route** | `/force-reset-password` |
| **Guard** | Has valid JWT but `must_reset_password = true` |
| **File** | `pages/ForcePasswordReset.jsx` |

**Use case:** A brand-new user (created by Admin with a temp password) is forced to change it on first login before they can do anything else.

**What it does**
- Three inputs: current temp password, new password, confirm new password.
- Client-side validates new password against the 12-char policy (upper/lower/digit/special).
- On success, clears the `must_reset_password` flag and routes to `/`.

**Data IN:** None (form is self-contained).

**Data OUT**
- `POST /auth/force-reset-password` → updates `users.password_hash`, `users.must_reset_password = false`; writes `audit_logs` (`PASSWORD_RESET_FORCED`).

---

## 3. Dashboard (role router)

| | |
|---|---|
| **Route** | `/` (index) |
| **Guard** | Authenticated |
| **File** | `pages/Dashboard.jsx` |

**Use case:** Landing page. Every user lands here after login and sees the right dashboard for their role.

**What it does:** Inspects `useAuth()` privilege tiers and renders one of seven variants:
- `isAdmin` → [AdminDashboard](#12-dashboards-admindashboard)
- `isReportManager` → [ReportManagerDashboard](#13-dashboards-reportmanagerdashboard)
- `isExecutive` → [ExecutiveDashboard](#14-dashboards-executivedashboard)
- `isHod` → [HodDashboard](#15-dashboards-hoddashboard)
- `isApprover` → [ApproverDashboard](#16-dashboards-approverdashboard)
- `isObserver` → [ObserverDashboard](#18-dashboards-observerdashboard)
- default → [InitiatorDashboard](#17-dashboards-initiatordashboard)

**Data IN / OUT:** Delegated to the chosen variant (see sections 12–18).

---

## 4. MyForms

| | |
|---|---|
| **Route** | `/my-forms` |
| **Guard** | Authenticated |
| **File** | `pages/MyForms.jsx` |

**Use case:** The initiator's command centre, listing every form they have ever submitted, plus drafts, sorted by status with filters.

**What it does**
- Status tabs: Draft / Submitted+Pending / Returned for Correction / Rejected / Completed.
- Search + date range + (Admin only) "org view" toggle to see every form in the org.
- Click a row → `FormDetail`. Click "New Form" → `SubmitForm`.
- Polls every 1 second to catch newly approved/rejected forms in near-realtime.

**Data IN**
- `GET /forms/instances?scope=mine|org&status=…&from=…&to=…&q=…` → reads `form_instances` + `form_versions` + `users` + `form_definitions`.

**Data OUT:** None directly (navigation only).

---

## 5. SubmitForm (new / edit)

| | |
|---|---|
| **Route** | `/my-forms/new` and `/my-forms/:id/edit` |
| **Guard** | Authenticated |
| **File** | `pages/SubmitForm.jsx` |

**Use case:** Where the initiator fills out a form. Used for new submissions, resuming a draft, and correcting a returned form.

**What it does**
- **Step 1** (new only): Pick the form type from a dropdown of forms the user is allowed to initiate.
- **Step 2**: WYSIWYG canvas (`FormFillerCanvas`) renders the schema. Auto-fills name/email/department/today's date. Live-evaluates calculated fields. Allows backdating if the form definition permits.
- Signature panel (typed or drawn). Drag-and-drop file uploads.
- **Save Draft** (no signature required) keeps the form in `Draft` status.
- **Submit** validates required fields, requires signature, locks the values into a new `form_version`, and initialises the approval chain.
- For corrections: pre-loads the latest version's values, shows a banner with the approver's notes, **Resubmit** creates a new version.

**Data IN**
- `GET /forms/definitions` → reads `form_definitions` filtered by initiator restrictions.
- `GET /forms/definitions/:id` → reads `form_definitions` + `form_fields`.
- `GET /forms/instances/:id` (edit) → reads `form_instances` + `form_versions` + `form_field_values` + `approval_instances`.
- `GET /settings/organization` → reads `organizations` (for letterhead + classification labels).
- `GET /users` (when picking a specific-user approver) → reads `users`.

**Data OUT**
- `POST /forms/instances` → writes `form_instances` (v1 draft) + `form_versions` + `form_field_values`; writes `audit_logs` (`FORM_DRAFT_CREATED`).
- `PATCH /forms/instances/:id/draft` → updates `form_field_values`; `audit_logs` (`FORM_DRAFT_SAVED`).
- `POST /forms/instances/:id/submit` → flips `form_instances.current_status` → Submitted, snapshots schema into `form_versions.schema_snapshot`, calls `initialize_approval_steps` to populate `approval_instances`, persists `initiator_signature_data`. Queues "please approve" email. Writes `audit_logs` (`FORM_SUBMITTED`).
- `POST /forms/instances/:id/resubmit` → creates a new `form_versions` row, copies forward `form_field_values`, restarts `approval_instances`; `audit_logs` (`FORM_RESUBMITTED`).
- `POST /forms/instances/:id/attachments` → writes `form_attachments`; saves file to media volume.

---

## 6. FormDetail

| | |
|---|---|
| **Route** | `/my-forms/:id` |
| **Guard** | Authenticated (gated by ownership / approver-on-chain / admin) |
| **File** | `pages/FormDetail.jsx` |

**Use case:** Read-only audit view of a single form. Initiators check status here; approvers review history; admins inspect and intervene.

**What it does**
- Renders the form values exactly as submitted (using `schema_snapshot`).
- Shows the full approval chain with status badges, signatures, timestamps, send-back notes.
- Lists attachments with inline preview (PDF.js for PDFs, native `<img>` for images) + download.
- Version history banner if multiple versions exist; correction notes pinned at top.
- Download buttons: original PDF and per-attachment.
- Admin-only buttons: Cancel Form, Send Back, Reassign Step.

**Data IN**
- `GET /forms/instances/:id` → reads `form_instances` + all versions + field values + `approval_instances` (with approver + signature) + `form_attachments`.
- `GET /forms/definitions/:id` → reads `form_definitions` + `form_fields` (for fallback rendering).
- `GET /forms/attachments/:id` → reads `form_attachments`, streams file bytes from media volume.
- `GET /forms/instances/:id/pdf` → triggers WeasyPrint/overlay render of `generated_documents`.
- `GET /users` → reads `users` (for the reassign dropdown).

**Data OUT** (admin actions only)
- `POST /approvals/:id/admin-cancel` → flips `form_instances.current_status` → Cancelled; `audit_logs` (`FORM_ADMIN_CANCELLED`).
- `POST /approvals/:id/admin-send-back` → updates `approval_instances` (active step → Sent Back), creates a new `form_versions` row; `audit_logs` (`FORM_ADMIN_SENT_BACK`).
- `POST /approvals/:id/reassign-step` → updates `approval_instances.approver_user_id`; `audit_logs` (`STEP_REASSIGNED`).

---

## 7. ApprovalsInbox

| | |
|---|---|
| **Route** | `/approvals` and `/approvals/history` |
| **Guard** | Authenticated |
| **File** | `pages/ApprovalsInbox.jsx` |

**Use case:** The approver's inbox. Everything waiting for them, plus a history of what they've already decided.

**What it does**
- Two tabs: **Pending** (active steps assigned to me) and **History** (my past decisions).
- Each row shows form name, reference, initiator, submitted date, urgency badge (days waiting).
- Click → `ApprovalAction`.
- History tab supports filter by action (approved / rejected / sent back) + date range.

**Data IN**
- `GET /approvals/pending` → reads `approval_instances` where `approver_user_id = me AND status = Active`, joined to `form_instances`, `form_versions`, `users` (initiator).
- `GET /approvals/history?action=…&from=…&to=…` → reads same tables filtered to terminal statuses.

**Data OUT:** None (navigation only).

---

## 8. ApprovalAction

| | |
|---|---|
| **Route** | `/approvals/:formInstanceId` |
| **Guard** | Authenticated (gated to active approver / admin) |
| **File** | `pages/ApprovalAction.jsx` |

**Use case:** Where an approver makes a decision on a single form.

**What it does**
- Two-column layout: form contents on the left (rendered identically to FormDetail), action panel on the right.
- Buttons: **Approve**, **Reject**, **Send Back**. Reject/Send Back require notes.
- Signature pad (typed or drawn), required on Approve.
- Date input (`signed_on`) defaults to today, capped at today, which lets an approver backdate to when they actually decided.
- Admin override buttons (when admin viewing): Admin Cancel, Admin Send Back, Reassign Step.

**Data IN**
- `GET /forms/instances/:id` → full form + chain.
- `GET /forms/definitions/:id` → schema for rendering.
- `GET /forms/attachments/:id` → preview attachments inline.

**Data OUT**
- `POST /approvals/:id/approve` → updates `approval_instances` (current step → Approved, next step → Active), writes `signatures` row, persists `signed_at`. If last step, flips `form_instances.current_status` → Approved → triggers background PDF rendering + completion emails. `audit_logs` (`STEP_APPROVED` / `FORM_COMPLETED`).
- `POST /approvals/:id/reject` → flips current step → Rejected, `form_instances.current_status` → Rejected; queues rejection email; `audit_logs` (`STEP_REJECTED`).
- `POST /approvals/:id/send-back` → flips current step → Sent Back, `form_instances.current_status` → Returned for Correction; queues notes email to initiator; `audit_logs` (`STEP_SENT_BACK`).

---

## 9. Delegations

| | |
|---|---|
| **Route** | `/delegations` |
| **Guard** | Authenticated |
| **File** | `pages/Delegations.jsx` |

**Use case:** Personal delegation manager. Lets a user delegate their approval authority for a window (vacation, sick leave) or see who has delegated TO them.

**What it does**
- Two lists: **Delegations I created** and **Delegations granted to me**.
- "Create" dialog: pick delegate user, optional role (role-scoped delegation), start + end dates, reason.
- "Return" button on active delegations ends them early.

**Data IN**
- `GET /delegations` → reads `delegations` where I am either `original_approver_id` or `delegate_user_id`.
- `GET /users` (in create dialog) → reads `users`.
- `GET /roles` (in create dialog) → reads `roles`.

**Data OUT**
- `POST /delegations` → writes `delegations`; `audit_logs` (`DELEGATION_CREATED`).
- `POST /delegations/:id/return` → updates `delegations.is_active = false`, sets `returned_at`; `audit_logs` (`DELEGATION_RETURNED`).

---

## 10. Documents

| | |
|---|---|
| **Route** | `/documents` |
| **Guard** | Authenticated |
| **File** | `pages/Documents.jsx` |

**Use case:** Archive of completed/approved forms. Where you go to find the signed PDF of something that finished last month.

**What it does**
- Searchable list of completed documents.
- Each row: reference number, form name, completion date, status badge.
- **Download** button streams the freshly-rendered PDF (re-rendered every click to pick up renderer fixes).

**Data IN**
- `GET /documents` → reads `generated_documents` joined to `document_shares` filtered to me (admins see all org).

**Data OUT**
- `GET /documents/:id/download` (streams PDF) → triggers live re-render (overlay → WeasyPrint → ReportLab fallback chain). Does not mutate `generated_documents`.

---

## 11. Logs

| | |
|---|---|
| **Route** | `/logs` |
| **Guard** | Admin only |
| **File** | `pages/Logs.jsx` |

**Use case:** The audit trail. Investigations, compliance, debugging "who deleted that?".

**What it does**
- Paginated table of every audit event in the org.
- Filters by user, action type, entity type, date range.
- Expandable row reveals the `details` JSON.

**Data IN**
- `GET /dashboard/logs?user_id=…&action=…&from=…&to=…&page=…` → reads `audit_logs` joined to `users`.

**Data OUT:** None. Read-only.

---

## 12. Dashboards: AdminDashboard

| | |
|---|---|
| **File** | `pages/dashboards/AdminDashboard.jsx` |

**Use case:** System operator's overview. KPIs, recent activity, drill-down filters.

**What it does**
- Cards: total forms by status, users by status, average approval time, top form types.
- Filterable table of recent submissions.
- Quick links to Users / Forms / Templates / Logs.

**Data IN**
- `GET /dashboard/admin?from=…&to=…&form_def_id=…` → reads `form_instances` + `users` + `audit_logs` (recent events).

**Data OUT:** None.

---

## 13. Dashboards: ReportManagerDashboard

| | |
|---|---|
| **File** | `pages/dashboards/ReportManagerDashboard.jsx` |

**Use case:** Department managers with reporting privileges, covering their own department's submissions and stats.

**What it does**
- Department-scoped KPIs.
- "Recent submissions by my department" list.
- Can create users in their department.

**Data IN**
- `GET /dashboard/report-manager` → reads `form_instances` joined to `users` + `departments`, scoped to the manager's department subtree.

**Data OUT**
- `POST /users` (via embedded create-user dialog) → writes `users` + `user_roles`; queues welcome email; `audit_logs`.

---

## 14. Dashboards: ExecutiveDashboard

| | |
|---|---|
| **File** | `pages/dashboards/ExecutiveDashboard.jsx` |

**Use case:** C-suite (CEO/CFO/Directors). Org-wide trends + only the executive-tier approvals they're personally on.

**What it does**
- Trend charts (forms over time, by department, by form type).
- Personal approval queue for forms requiring executive sign-off.
- Read-only, no creation/editing actions.

**Data IN**
- `GET /dashboard/admin` (read-only slice).
- `GET /approvals/pending` → personal queue.

**Data OUT:** None directly (approval actions happen on `ApprovalAction`).

---

## 15. Dashboards: HodDashboard

| | |
|---|---|
| **File** | `pages/dashboards/HodDashboard.jsx` |

**Use case:** Head of Department. Combines initiator and approver views, scoped to their department.

**What it does**
- Own submissions summary + pending approvals from their department's members.
- Drill-down to FormDetail or ApprovalAction.

**Data IN**
- `GET /dashboard/initiator` → my submissions.
- `GET /dashboard/approver` → my pending.
- `GET /forms/instances?scope=org&department=...` → department-scoped list.

**Data OUT:** None directly.

---

## 16. Dashboards: ApproverDashboard

| | |
|---|---|
| **File** | `pages/dashboards/ApproverDashboard.jsx` |

**Use case:** Functional approvers (HR, Finance, IT…). Their queue + recent history.

**What it does**
- Pending count card, average decision time, oldest pending.
- Quick "open inbox" link.

**Data IN**
- `GET /dashboard/approver` → reads `approval_instances` for me, aggregates counts/timings.

**Data OUT:** None.

---

## 17. Dashboards: InitiatorDashboard

| | |
|---|---|
| **File** | `pages/dashboards/InitiatorDashboard.jsx` |

**Use case:** Default for every employee. "What have I submitted, what's pending, what's done".

**What it does**
- Status counters (Draft / Pending / Returned / Approved).
- Most recent submissions list.
- Prominent "New Form" call-to-action.

**Data IN**
- `GET /dashboard/initiator` → reads `form_instances` where `created_by = me`, aggregated by status.

**Data OUT:** None.

---

## 18. Dashboards: ObserverDashboard

| | |
|---|---|
| **File** | `pages/dashboards/ObserverDashboard.jsx` |

**Use case:** Read-only auditor/compliance role. Org-wide visibility, zero write.

**What it does**
- Org-wide completed-documents browser.
- No submit / approve / edit buttons.

**Data IN**
- `GET /documents` (organisation scope).

**Data OUT:** None.

---

## 19. Admin: Users

| | |
|---|---|
| **Route** | `/admin/users` |
| **Guard** | Admin only |
| **File** | `pages/admin/Users.jsx` |

**Use case:** User lifecycle: create, edit, assign roles + department + manager hierarchy, deactivate.

**What it does**
- Table of all org users with role badges, status, last login.
- Create dialog: name, email, department, manager / SN manager / HOD, roles.
- Edit dialog: same fields + force-reset-password trigger.
- Deactivate (soft-delete) button.

**Data IN**
- `GET /users` → reads `users` + `user_roles` + `roles` + `departments`.
- `GET /roles` → reads `roles`.
- `GET /departments` → reads `departments`.

**Data OUT**
- `POST /users` → writes `users` + `user_roles`; generates temp password; queues welcome email; `audit_logs` (`USER_CREATED`).
- `PATCH /users/:id` → updates `users`; replaces `user_roles` rows; `audit_logs` (`USER_UPDATED`).
- `DELETE /users/:id` → flips `users.status = Not Active`; `audit_logs` (`USER_DEACTIVATED`).

---

## 20. Admin: Departments

| | |
|---|---|
| **Route** | `/admin/departments` |
| **Guard** | Admin only |
| **File** | `pages/admin/Departments.jsx` |

**Use case:** Org structure setup. Drives "Department" auto-fill in forms and dept-scoped reports.

**What it does**
- Tree view of departments + sub-departments.
- Create / rename / nest / delete (blocked if dept has members).

**Data IN**
- `GET /departments` → reads `departments` with member counts.

**Data OUT**
- `POST /departments` → writes `departments`; `audit_logs`.
- `PATCH /departments/:id` → updates `departments`; `audit_logs`.
- `DELETE /departments/:id` → flips `departments.is_active = false`; `audit_logs`.

---

## 21. Admin: FormDefinitions

| | |
|---|---|
| **Route** | `/admin/form-definitions` |
| **Guard** | Admin only |
| **File** | `pages/admin/FormDefinitions.jsx` |

**Use case:** Manage the catalogue of forms users can submit. List, create, edit metadata, route to designer/builder, soft-delete.

**What it does**
- Table of all form definitions: name, code suffix, attached approval template, visibility, status.
- Date-range + keyword search.
- **Create / Edit** dialog: name, printed title, description, code suffix, visibility (all / specific departments), allow backdating, allow attachments, approval template, classification.
- Buttons to launch `FormDesigner` (schema/field layout) or `FormBuilder` (PDF template).

**Data IN**
- `GET /forms/definitions` → reads `form_definitions`.
- `GET /approval-templates` → reads `approval_templates`.
- `GET /departments` → reads `departments` (visibility picker).
- `GET /settings/organization` → reads `organizations.classification_labels`.

**Data OUT**
- `POST /forms/definitions` → writes `form_definitions` + initiator junction tables; `audit_logs`.
- `PATCH /forms/definitions/:id` → updates `form_definitions`; replaces initiator junction rows; `audit_logs`.
- `DELETE /forms/definitions/:id` → flips `form_definitions.is_active = false`; cancels active instances; `audit_logs`.

---

## 22. Admin: FormBuilder

| | |
|---|---|
| **Route** | `/admin/form-definitions/:id/builder` |
| **Guard** | Admin only (full-screen, no sidebar) |
| **File** | `pages/admin/FormBuilder.jsx` |

**Use case:** Map form fields onto a pre-existing PDF (e.g., a regulator's mandated layout). For forms that need pixel-perfect output.

**What it does**
- Upload a PDF as the background.
- PDF.js renders each page; admin drops field markers at coordinates.
- Save persists `page_number`, `x_pct`, `y_pct`, `width_pct`, `height_pct` per field.

**Data IN**
- `GET /forms/definitions/:id` → reads `form_definitions` + `form_fields`.
- `GET /forms/definitions/:id/pdf-template` → streams PDF bytes from media volume.
- `GET /forms/definitions/:id/pdf-template/page/:n` → streams per-page template.

**Data OUT**
- `POST /forms/definitions/:id/pdf-template` → saves PDF to media volume, updates `form_definitions.pdf_template_path`; `audit_logs`.
- `POST /forms/definitions/:id/pdf-template/page/:n` → saves per-page template.
- `PUT /forms/definitions/:id/fields` → replaces `form_fields` rows for the definition (upsert with soft-delete of removed fields); `audit_logs`.

---

## 23. Admin: FormDesigner

| | |
|---|---|
| **Route** | `/admin/form-definitions/:id/design` |
| **Guard** | Admin only (full-screen) |
| **File** | `pages/admin/FormDesigner.jsx` |

**Use case:** Drag-and-drop schema designer. The general-purpose alternative to FormBuilder, for forms that don't need a fixed PDF background.

**What it does**
- Toolbox (left) of field types: text, textarea, number, date, dropdown, checkbox, radio, currency, calculated, file, signature, table.
- Canvas (centre) renders the current layout with section grouping + grid-width picker (`1/4`, `1/2`, `full`, etc.).
- Property panel (right) edits the selected field: label, required, validation rules, auto-fill source, calculation formula, options for dropdowns.
- Approval chain editor + initiator-roles/users editor live alongside.

**Data IN**
- `GET /forms/definitions/:id` → reads `form_definitions` + `form_fields`.
- `GET /roles`, `GET /users/directory` → for initiator + approver pickers.

**Data OUT**
- `PATCH /forms/definitions/:id` → updates `form_definitions` (printed title, section layouts, approval template link, classification, initiator junction tables); `audit_logs`.
- `PUT /forms/definitions/:id/fields` → replaces `form_fields`; `audit_logs`.

---

## 24. Admin: ApprovalTemplates

| | |
|---|---|
| **Route** | `/admin/approval-templates` |
| **Guard** | Admin only |
| **File** | `pages/admin/ApprovalTemplates.jsx` |

**Use case:** Build reusable approval workflows. Once an approval template is defined, any form can attach it.

**What it does**
- List of templates with step counts.
- Editor: add steps in order; per step pick role type (Hierarchy / Functional / Executive / Specific User / Selected at Submission / Email), specific role/user, optional/required, delegation allowed.
- CC recipients editor: people copied on completion (role-based or named users or free-text emails).
- Reorder steps with ↑/↓ buttons.
- Toggle "restart on correction", controlling whether send-back resets the chain to step 1.

**Data IN**
- `GET /approval-templates` → reads `approval_templates` with step counts.
- `GET /approval-templates/:id` → reads template + `approval_template_steps` + `approval_template_cc_recipients`.
- `GET /roles`, `GET /users/directory`, `GET /departments` → pickers.

**Data OUT**
- `POST /approval-templates` → writes `approval_templates` + step + CC rows; `audit_logs`.
- `PATCH /approval-templates/:id` → merge-updates steps (keys by id, inserts/updates/soft-deletes), replaces CC rows; `audit_logs`.
- `DELETE /approval-templates/:id` → flips `approval_templates.is_active = false`; `audit_logs`.

---

## 25. Admin: Delegations

| | |
|---|---|
| **Route** | `/admin/delegations` |
| **Guard** | Admin only |
| **File** | `pages/admin/Delegations.jsx` |

**Use case:** Org-wide delegation visibility + the ability to force delegations on behalf of someone (e.g., when they're suddenly unreachable).

**What it does**
- Table of every active delegation in the org.
- Admin-create dialog: pick original approver, delegate, role scope, dates, reason.
- Force-return button.

**Data IN**
- `GET /delegations/all` → reads `delegations` org-wide.
- `GET /users` → user picker.
- `GET /roles` → role picker.

**Data OUT**
- `POST /delegations/admin-create` → writes `delegations`; `audit_logs` (`ADMIN_DELEGATION_CREATED`).
- `POST /delegations/:id/return` → ends delegation; `audit_logs`.

---

## 26. Admin: Settings

| | |
|---|---|
| **Route** | `/admin/settings` |
| **Guard** | Admin only |
| **File** | `pages/admin/Settings.jsx` |

**Use case:** Organisation profile + branding. Header/footer letterhead images, accent colour, classification label palette.

**What it does**
- Org profile form: name, subdomain, email_domain, subscription plan.
- Header + footer image upload (replaces existing).
- Letterhead accent colour picker.
- Classification labels editor (add/remove/rename Public/Internal/Confidential/Restricted-style labels).

**Data IN**
- `GET /settings/organization` → reads `organizations`.
- `GET /settings/organization/header` → streams header image from media volume.
- `GET /settings/organization/footer` → streams footer image from media volume.

**Data OUT**
- `PATCH /settings/organization` → updates `organizations`; `audit_logs`.
- `POST /settings/organization/header` → saves file to media volume, updates `organizations.header_image_path`; `audit_logs`.
- `POST /settings/organization/footer` → saves file to media volume, updates `organizations.footer_image_path`; `audit_logs`.
- `DELETE /settings/organization/header` / `…/footer` → removes the path + file; `audit_logs`.

---

## Appendix: Page → Endpoint → Table cheat-sheet

| Page | Reads from | Writes to |
|---|---|---|
| Login | `users`, `organizations`, `user_roles`, `roles` | `audit_logs`, `users.last_login`, `password_reset_tokens` |
| ForcePasswordReset | None | `users.password_hash`, `audit_logs` |
| Dashboard router | (delegates) | (delegates) |
| MyForms | `form_instances`, `form_versions`, `form_definitions`, `users` | None |
| SubmitForm | `form_definitions`, `form_fields`, `form_instances`, `form_versions`, `form_field_values`, `organizations`, `users` | `form_instances`, `form_versions`, `form_field_values`, `form_attachments`, `approval_instances`, `signatures`, `audit_logs` |
| FormDetail | `form_instances`, `form_versions`, `form_field_values`, `approval_instances`, `signatures`, `form_attachments`, `form_definitions`, `generated_documents` | (admin only) `form_instances`, `approval_instances`, `audit_logs` |
| ApprovalsInbox | `approval_instances`, `form_instances`, `form_versions`, `users` | None |
| ApprovalAction | `form_instances`, `form_versions`, `form_field_values`, `approval_instances`, `form_attachments` | `approval_instances`, `signatures`, `form_instances`, `generated_documents`, `document_shares`, `audit_logs` |
| Delegations | `delegations`, `users`, `roles` | `delegations`, `audit_logs` |
| Documents | `generated_documents`, `document_shares` | None |
| Logs | `audit_logs`, `users` | None |
| Admin Users | `users`, `user_roles`, `roles`, `departments` | `users`, `user_roles`, `audit_logs` |
| Admin Departments | `departments` | `departments`, `audit_logs` |
| Admin FormDefinitions | `form_definitions`, `approval_templates`, `departments`, `organizations` | `form_definitions`, `form_definition_initiator_roles`, `form_definition_initiator_users`, `audit_logs` |
| Admin FormBuilder | `form_definitions`, `form_fields`, PDF templates on media volume | `form_definitions.pdf_template_path`, `form_fields`, media volume files, `audit_logs` |
| Admin FormDesigner | `form_definitions`, `form_fields`, `roles`, `users` | `form_definitions`, `form_fields`, junction tables, `audit_logs` |
| Admin ApprovalTemplates | `approval_templates`, `approval_template_steps`, `approval_template_cc_recipients`, `roles`, `users`, `departments` | `approval_templates`, `approval_template_steps`, `approval_template_cc_recipients`, `audit_logs` |
| Admin Delegations | `delegations`, `users`, `roles` | `delegations`, `audit_logs` |
| Admin Settings | `organizations`, header/footer image files | `organizations`, media volume files, `audit_logs` |

---

**End of page-by-page reference.**

For the API contract (request/response shapes) consult `/flowdesk/api/docs` (Swagger UI) on the running server. For system-level architecture, deployment, and security context, see [`FLOWDESK_BLUEPRINT.md`](FLOWDESK_BLUEPRINT.md).
