# FlowDesk — Project Structure

## Overview

FlowDesk is a document workflow and approval management system built for BSC Rwanda. It consists of a FastAPI backend, a React frontend, and a PostgreSQL database — all orchestrated with Docker Compose.

---

## Top-Level Layout

```
FlowDesk/
├── backend/                  # FastAPI application
├── frontend/                 # React application
├── database/                 # SQL init, migrations, seeds
├── media/                    # Runtime file storage (gitignored)
├── .env                      # Environment variables (gitignored)
├── .env.example              # Environment variable template
├── docker-compose.yml        # Container orchestration
├── structure.md              # This file
└── .gitignore
```

---

## Backend (`backend/`)

FastAPI application with SQLAlchemy ORM and PostgreSQL.

```
backend/
├── main.py                   # App entry point — registers routers, middleware, lifespan
├── config.py                 # Pydantic settings — reads all env vars, validates on startup
├── database.py               # SQLAlchemy engine, SessionLocal, Base
├── requirements.txt          # Python dependencies
├── alembic.ini               # Alembic migration config (migrations not yet generated)
├── Dockerfile                # Container image — python:3.12-slim + pip install
├── seed_demo.py              # Seeds demo org + BSC core users (25 users)
├── seed_bsc_users.py         # Seeds full BSC Rwanda staff (102 users total)
│
├── models/                   # SQLAlchemy ORM models (table definitions)
│   ├── organization.py       # Organization, Department
│   ├── user.py               # User, Role, UserRole, RoleCategory, PasswordResetToken
│   ├── form.py               # FormDefinition, FormField, FormInstance, FormFieldValue,
│   │                         #   FormVersion, FormAttachment, GeneratedDocument
│   ├── approval.py           # ApprovalTemplate, ApprovalTemplateStep,
│   │                         #   ApprovalInstance, Signature
│   ├── delegation.py         # Delegation
│   ├── audit.py              # AuditLog
│   └── document.py           # DocumentShare
│
├── routers/                  # FastAPI route handlers (one file per resource)
│   ├── auth.py               # POST /auth/login, /auth/me, /auth/force-reset-password,
│   │                         #   /auth/forgot-password, /auth/reset-password,
│   │                         #   /auth/mfa/setup|enable|verify
│   ├── users.py              # GET/POST/PUT/DELETE /users, /users/{id}
│   ├── organizations.py      # /organizations, /departments
│   ├── forms.py              # /forms/definitions, /forms/instances,
│   │                         #   /forms/instances/{id}/submit|approve|reject
│   ├── approvals.py          # /approvals/pending, /approvals/{id}/action
│   ├── delegations.py        # /delegations
│   ├── documents.py          # /documents
│   └── dashboard.py          # /dashboard — role-specific aggregated data
│
├── schemas/                  # Pydantic request/response models
│   ├── auth.py               # LoginRequest, TokenResponse, PasswordResetRequest
│   ├── user.py               # UserCreate, UserUpdate, UserResponse
│   ├── organization.py       # OrgResponse, DepartmentResponse
│   ├── form.py               # FormDefinitionCreate/Update/Response,
│   │                         #   FormFieldCreate/Response, FormInstanceResponse
│   ├── approval.py           # ApprovalTemplateCreate/Response, ApprovalActionRequest
│   └── delegation.py         # DelegationCreate/Response
│
├── services/                 # Business logic layer
│   ├── auth_service.py       # hash_password, verify_password (bcrypt),
│   │                         #   validate_password_strength, MFA (pyotp), reset tokens
│   ├── form_service.py       # Reference number generation, form instance creation
│   ├── approval_service.py   # Approval routing, step advancement, hierarchy resolution
│   ├── document_service.py   # PDF generation, document storage
│   ├── audit_service.py      # Writes AuditLog records for all state changes
│   ├── email_service.py      # SMTP email notifications (Office 365)
│   └── pdf_overlay_service.py# Overlays field values onto PDF templates (reportlab)
│
├── core/                     # Cross-cutting infrastructure
│   ├── security.py           # JWT creation/verification (python-jose)
│   ├── dependencies.py       # get_current_user FastAPI dependency
│   └── permissions.py        # Role-based access checks, N+1-safe with selectinload
│
└── utils/                    # Shared helpers (currently minimal)
```

---

## Frontend (`frontend/`)

React 18 SPA built with Vite, styled with Tailwind CSS and shadcn/ui components.

```
frontend/
├── index.html                # HTML shell
├── vite.config.js            # Vite config — path alias @→src, vendor chunks
├── tailwind.config.js        # Tailwind — shadcn/ui CSS variable system, darkMode
├── postcss.config.js
├── package.json              # Dependencies: React, Vite, TanStack Query, shadcn/ui,
│                             #   Recharts, dnd-kit, pdfjs-dist, sonner, zod
│
└── src/
    ├── main.jsx              # ReactDOM.createRoot — wraps with QueryClient, AuthProvider,
    │                         #   ThemeProvider, BrowserRouter, Toaster
    ├── App.jsx               # Route definitions (react-router-dom)
    ├── index.css             # CSS custom properties (:root / .dark) — full design tokens
    │
    ├── context/
    │   └── AuthContext.jsx   # Current user state, login/logout, token storage
    │
    ├── api/                  # Axios API clients (one file per backend resource)
    │   ├── client.js         # Axios instance — baseURL=:9000, Authorization header
    │   ├── auth.js           # login, logout, getMe, forgotPassword, resetPassword
    │   ├── users.js          # listUsers, getUser, createUser, updateUser, deleteUser
    │   ├── forms.js          # listFormDefinitions, getFormDefinition,
    │   │                     #   createFormInstance, submitForm, uploadPdfTemplate,
    │   │                     #   updateFormFieldsLayout, uploadPdfTemplatePage
    │   ├── approvals.js      # getPendingApprovals, approveStep, rejectStep
    │   ├── delegations.js    # listDelegations, createDelegation, deleteDelegation
    │   ├── documents.js      # listDocuments, downloadDocument
    │   └── dashboard.js      # getDashboardData (role-aware)
    │
    ├── pages/                # Route-level page components
    │   ├── Login.jsx         # Login form with org auto-detection from email domain
    │   ├── ForcePasswordReset.jsx
    │   ├── MyForms.jsx       # List of user's submitted form instances
    │   ├── SubmitForm.jsx    # Fill and submit a form (renders fields + PDF overlay)
    │   ├── FormDetail.jsx    # View a submitted form instance + approval timeline
    │   ├── ApprovalsInbox.jsx# Approver's queue of pending steps
    │   ├── ApprovalAction.jsx# Approve / reject a specific step with comments
    │   ├── Delegations.jsx   # User's active delegations
    │   ├── Documents.jsx     # Generated documents list
    │   ├── Logs.jsx          # Audit log viewer
    │   │
    │   ├── dashboards/       # Role-specific dashboard views
    │   │   ├── AdminDashboard.jsx
    │   │   ├── ApproverDashboard.jsx
    │   │   ├── ExecutiveDashboard.jsx
    │   │   ├── InitiatorDashboard.jsx
    │   │   ├── ObserverDashboard.jsx
    │   │   └── ReportManagerDashboard.jsx
    │   │
    │   └── admin/            # Admin-only pages
    │       ├── FormDefinitions.jsx   # CRUD for form templates, visibility control
    │       ├── FormBuilder.jsx       # Opens PDF layout designer for a form definition
    │       ├── ApprovalTemplates.jsx # Create/edit multi-step approval workflows
    │       ├── Users.jsx             # User list + org chart tree view
    │       ├── Departments.jsx       # Dept management + drag-and-drop org chart
    │       └── Delegations.jsx       # Admin delegation management
    │
    ├── components/
    │   ├── theme-provider.jsx        # next-themes wrapper (light/dark/system)
    │   │
    │   ├── layout/                   # App shell
    │   │   ├── AppLayout.jsx         # Sidebar + header + main content area
    │   │   ├── Header.jsx            # Top bar — breadcrumb, theme toggle, user menu
    │   │   └── Sidebar.jsx           # Nav links filtered by user role
    │   │
    │   ├── pdf/                      # PDF designer and fill components
    │   │   ├── PDFFormBuilder.jsx    # Full layout designer — field placement, alignment
    │   │   │                         #   guides, multi-page, approval steps config,
    │   │   │                         #   data binding, field locking, zoom
    │   │   ├── PDFFormFill.jsx       # Read-only / fill view of a form with PDF background
    │   │   ├── PDFPageCanvas.jsx     # Renders a single PDF page onto a <canvas> (pdfjs)
    │   │   └── SignatureCanvas.jsx   # Touch/mouse signature pad
    │   │
    │   └── ui/                       # shadcn/ui primitives (Radix UI + Tailwind)
    │       ├── Button.jsx            # Variants: default, outline, ghost, destructive
    │       ├── Card.jsx              # Card, CardHeader, CardContent, CardFooter
    │       ├── Input.jsx             # Controlled text input
    │       ├── Badge.jsx             # Status / role badges
    │       ├── Modal.jsx             # Dialog wrapper
    │       ├── Table.jsx             # TanStack Table wrapper
    │       ├── Skeleton.jsx          # Loading placeholder
    │       ├── Spinner.jsx           # Inline loading spinner
    │       ├── alert.jsx             # Alert banners
    │       ├── avatar.jsx            # User avatar with initials fallback
    │       ├── collapsible.jsx       # Expand/collapse section
    │       ├── dropdown-menu.jsx     # Radix DropdownMenu
    │       ├── label.jsx             # Form label
    │       ├── progress.jsx          # Progress bar
    │       ├── scroll-area.jsx       # Styled scrollable container
    │       ├── select.jsx            # Radix Select
    │       ├── separator.jsx         # <hr> styled divider
    │       ├── switch.jsx            # Toggle switch
    │       ├── tabs.jsx              # Radix Tabs
    │       ├── theme-toggle.jsx      # Light/dark mode button
    │       └── tooltip.jsx           # Radix Tooltip
    │
    ├── lib/
    │   └── utils.js                  # cn() — clsx + tailwind-merge
    │
    └── utils/
        └── formulaEngine.js          # Evaluates calculated field formulas at runtime
```

---

## Database (`database/`)

```
database/
├── init/
│   └── 01_create_app_user.sql    # Runs on first container start — enables pgcrypto
│
├── migrations/                   # Manual SQL patches for live DB changes
│   ├── 001_fix_auth_emails_subdomain.sql
│   ├── 002_add_email_domain_two_orgs.sql
│   └── 003_add_performance_indexes.sql
│
└── seeds/                        # Reference seed data (MySQL syntax — use Python scripts instead)
    ├── 001_organizations.sql
    ├── 002_roles.sql
    ├── 003_users.sql
    ├── 004_user_roles.sql
    ├── 005_form_definitions.sql
    ├── 006_approval_templates.sql
    ├── 007_form_instances_demo.sql
    └── README.md
```

> Seeding is done via Python scripts in `backend/`: run `seed_demo.py` first, then `seed_bsc_users.py`.

---

## Media Storage (`media/`)

Runtime directory, mounted as a Docker volume (`media_data`). Not committed to git.

```
media/
├── pdf_templates/    # Uploaded PDF backgrounds for form templates
├── documents/        # Generated filled documents
├── attachments/      # Files attached to form submissions
└── signatures/       # Captured signature images
```

---

## Docker Setup

```
docker-compose.yml
│
├── db        (postgres:16-alpine)   port 5432  — data in volume postgres_data
├── api       (./backend Dockerfile) port 9000  — code bind-mounted from ./backend
└── frontend  (node:20-alpine)       port 3000  — code bind-mounted from ./frontend
```

All credentials are defined once in `.env` and referenced via `${VAR}` substitution in `docker-compose.yml`.

---

## Key Data Flows

### Form Submission
`SubmitForm.jsx` → `POST /forms/instances` → `form_service.py` generates reference number → `AuditLog` entry → approval routing begins

### Approval Step
`ApprovalsInbox` → `POST /approvals/{id}/action` → `approval_service.py` advances step or closes workflow → `email_service.py` notifies next approver → `pdf_overlay_service.py` generates final document on completion

### Authentication
`Login.jsx` → `POST /auth/login` → org detected from email domain → JWT issued → `AuthContext` stores token → all API calls send `Authorization: Bearer <token>` → `core/dependencies.py` validates on every request

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite |
| Styling | Tailwind CSS + shadcn/ui (Radix UI) |
| State / data fetching | TanStack Query v5 |
| Charts | Recharts |
| Drag and drop | @dnd-kit |
| PDF rendering | pdfjs-dist |
| Backend framework | FastAPI (Python 3.12) |
| ORM | SQLAlchemy 2 |
| Validation | Pydantic v2 |
| Auth | JWT (python-jose) + bcrypt |
| Database | PostgreSQL 16 |
| Email | aiosmtplib (Office 365 / SMTP) |
| PDF generation | reportlab |
| Containerisation | Docker + Docker Compose |
