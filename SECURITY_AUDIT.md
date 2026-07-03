# FlowDesk — Security Audit Report

> **REMEDIATION STATUS (2026-07-03): all findings addressed in code.** See the
> "Remediation summary" section at the bottom for the per-finding status and the
> two operational actions that still require a human (rotate the live Postgres
> password; provision TLS certificates at the edge). Core auth fixes were
> verified end-to-end with an automated test (JWT algorithm pinning, `alg=none`
> rejection, the password-reset gate, token invalidation on password change,
> login rate-limiting, and docs-disabled-in-production all pass).

**Date:** 2026-07-03
**Scope:** Full source tree — FastAPI backend (`core/`, `routers/`, `services/`, `models/`, `schemas/`), React/Vite frontend (`frontend/src/`), and deployment/infra (`Dockerfile*`, `docker-compose*.yml`, `nginx/`, env files, dependencies).
**Method:** File-by-file manual review. Backend auth core read directly; breadth covered by five parallel focused audits, then load-bearing findings re-verified against source.

---

## Executive summary

FlowDesk is a multi-role, per-organization approval-and-document workflow platform. The authentication core is mostly well-built — bcrypt hashing, CSPRNG tokens, TOTP MFA with a correct pending-token exchange, ORM-parameterized queries (no SQL injection found), and generally consistent per-organization tenant scoping.

However, the review found **2 Critical**, **9 High**, and numerous Medium/Low issues. The dominant themes are:

1. **Broken access control on files** — all generated documents *and captured signatures* are served with no authentication, and several record-fetch endpoints check only the tenant, not the individual user (IDOR).
2. **Secret management** — a real production `SECRET_KEY` and DB password live in working-tree env files and are baked into the Docker image; leaking the signing key allows forging any user's session.
3. **No anti-automation** — there is no rate limiting or account lockout anywhere, making password and TOTP brute-force practical.
4. **Missing hardening** — wildcard CORS with credentials, exposed API docs, no TLS/security headers, containers as root, `--reload` in production, and a path-traversal file-upload primitive.

### Findings by severity

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 9 |
| Medium | 17 |
| Low | 9 |

### Top remediation priorities (do these first)

1. **Rotate the production `SECRET_KEY` and DB password now** — assume compromised (C1). Invalidates existing sessions; that is expected.
2. **Authenticate `/media`** — stop serving documents and signatures as public static files (H1).
3. **Stop baking `.env` into the Docker image** (C2) — remove `!.env` from `.dockerignore`.
4. **Add rate limiting + lockout** on `/auth/*` (H2).
5. **Fix the two IDORs and the attachment path traversal** (H4, H5, H3).
6. **Lock down CORS** to explicit origins without wildcard+credentials (H6).

---

## CRITICAL

### C1 — Production `SECRET_KEY` / DB password exposed and baked into the Docker image
**Files:** `.dockerignore:8-9`, `Dockerfile:14`, `.env.production` (`SECRET_KEY`, `DB_PASSWORD`, `DATABASE_URL`), `.env` (`SECRET_KEY`, `SUPER_ADMIN_PASSWORD`)

**Description.** `.env` and `.env.production` are correctly git-ignored and were **never committed** (verified against full history — good). But they exist in the working tree with real live values: `.env.production` holds a real 64-hex-char `SECRET_KEY` and `DB_PASSWORD=FlowDesk_App@2024`; `.env` holds another real `SECRET_KEY` and `SUPER_ADMIN_PASSWORD=ChangeMe123!`. Worse, `.dockerignore` ignores `.env*` and then **re-includes** `.env` (`!.env`), and `Dockerfile:14` does `COPY . .` — so the dev `.env`, including its signing key and admin password, is embedded in an image layer that survives even if the file is later deleted.

**Impact.** The JWT signing key is the master key to authentication. Anyone who can read these files (repo clone, backup, or `docker pull`/`docker history` on the image / registry) can:
- Forge a valid access token for *any* user, including the super admin (`jwt.encode({"sub": <id>, "org_id": <org>, "type": "access"}, SECRET_KEY, "HS256")`), completely bypassing login and MFA.
- Connect directly to Postgres with the (also weak) DB password.

**Fix.**
- Treat both `SECRET_KEY`s and the DB password as compromised and **rotate immediately** (`openssl rand -hex 32` for the key; change the Postgres role password).
- Remove the `!.env` line from `.dockerignore` so no env file enters the build context. Inject secrets at runtime via Docker/orchestrator secrets or a vault (compose already uses `env_file:`, so the image copy is pure liability).
- Strengthen the DB password; leave `SUPER_ADMIN_PASSWORD` blank so a random one is generated and logged once (as `.env.example` already does).

### C2 — Uploaded documents and signatures served with no authentication (`/media`)
**Files:** `main.py:92-94`, `nginx/nginx.conf:47-51`, write path `services/document_service.py:259-266`, `routers/forms.py:565-571`

**Description.** Startup creates `media/{documents,attachments,signatures,pdf_templates}` (`main.py:38-41`) and mounts the whole tree as public static files: `app.mount("/media", StaticFiles(directory=media_dir))`. nginx proxies `/media/` straight through with no auth. Generated PDFs are written to `media/documents/{organization_id}/{reference}_final.pdf` and signatures/attachments similarly. There is a proper, org-scoped, authenticated download endpoint (`routers/documents.py:15`), but the static mount bypasses it entirely.

**Impact.** Anyone who can reach the host and knows/guesses a path can download any organization's completed documents (HR, finance, executive forms) and — critically — the captured **signature images**. Exposed signatures enable approval/document forgery. This is unauthenticated, cross-tenant data disclosure.

**Fix.** Remove the public `/media` StaticFiles mount and the nginx `/media/` location. Serve every media object through an authenticated FastAPI route that authorizes the requesting user against the owning record (reuse the `DocumentShare`/admin predicate from `list_documents`). Use unguessable object keys. Never expose signatures publicly.

---

## HIGH

### H1 — No rate limiting or account lockout on authentication endpoints
**Files:** `routers/auth.py` (`/login` :28, `/mfa/verify` :83, `/forgot-password` :153, `/reset-password` :182). Confirmed: no `slowapi`/limiter/lockout anywhere in the code.

**Description.** None of the auth endpoints throttle attempts or lock accounts after repeated failures. `verify_totp` uses `valid_window=1` (a ~90-second acceptance window) with no attempt cap.

**Impact.** Online password brute-force against `/login`, and — for an attacker who already knows a password — brute-force of the 6-digit TOTP at `/mfa/verify` (they can re-request a fresh 5-minute pending token as needed). No lockout means unlimited attempts.

**Fix.** Add per-IP and per-account rate limiting (e.g. `slowapi`) on all `/auth/*` endpoints, exponential backoff / temporary lockout after N failed logins, and a strict attempt cap on TOTP verification. Return `429` with `Retry-After`.

### H2 — Path traversal + unrestricted file write in attachment upload
**File:** `routers/forms.py:567-571`

**Description.** `stored_name = f"{uuid.uuid4()}_{file.filename}"` then `file_path = os.path.join(attach_dir, stored_name)`, written via `shutil.copyfileobj`. `file.filename` is fully attacker-controlled and unsanitized. A filename such as `..\..\..\main.py` (Windows target) escapes `attach_dir` — the `uuid_` prefix is consumed by the first `..` — allowing the upload to be written to an arbitrary path. There is also no size limit, no content-type/extension allowlist, and `form_def.allow_attachments` is not checked.

**Impact.** An authenticated form owner can overwrite application/config files or plant files on the server — a plausible path to remote code execution — plus unbounded-size upload (disk-exhaustion DoS) and arbitrary file types.

**Fix.** Never build the stored path from the client filename. Store under the UUID alone (or `os.path.basename` + strip separators), keeping the original name only as DB metadata. Enforce a max size by streaming with a byte cap, and an extension/content-type allowlist. Honor `allow_attachments`. After building the path, assert `os.path.realpath(file_path)` stays under `attach_dir`.

### H3 — IDOR: any org user can download any completed form's final PDF
**File:** `routers/documents.py:15-44` (`download_document`)

**Description.** The handler verifies only that the `FormInstance` is in the caller's org, then returns the final PDF. It never checks that the caller is the initiator, an approver, a CC recipient, or admin — unlike the sibling `list_documents` (:47-93), which gates on `DocumentShare`/admin.

**Impact.** Any authenticated user can enumerate/guess `form_instance_id` values and download colleagues' signed documents (salary, disciplinary, finance) they were never party to.

**Fix.** Before returning the file, require admin role or an existing `DocumentShare` row for `(document_id, current_user.id)` — reuse the exact predicate `list_documents` already uses.

### H4 — IDOR: any org user can read any form instance and its field values
**File:** `routers/forms.py:407-419` (`get_form_instance`)

**Description.** Fetch is scoped only by `organization_id`; there is no `created_by`/approver/admin check, inconsistent with `list_form_instances` (:326-364) which restricts non-admins to their own instances.

**Impact.** A low-privilege user can read the full field-value contents of any colleague's form just by knowing/guessing the instance id.

**Fix.** After the org-scoped fetch, allow only if `instance.created_by == current_user.id`, the user has an `ApprovalInstance` on one of its versions, or the user is admin; otherwise 404.

### H5 — CORS wildcard origin combined with credentials
**File:** `main.py:65-71`

**Description.** `allow_origins=["*"]` with `allow_credentials=True`, `allow_methods=["*"]`, `allow_headers=["*"]`, all hardcoded. The `ALLOWED_ORIGINS` env value is never read — `config.py` doesn't define it (`extra="ignore"`), so the "validator requires this in production" comment in `.env.production` is inert; CORS is *always* wildcard. Starlette reflects the request origin when `allow_credentials=True`, so this effectively allows every origin with credentials.

**Impact.** Any website can drive authenticated cross-origin requests using the victim's credentials, enabling data exfiltration / CSRF-style abuse of every credentialed endpoint.

**Fix.** Set `allow_origins` to the explicit frontend origin(s) from settings; wire `ALLOWED_ORIGINS` into `config.py`. Never combine `*` with `allow_credentials=True`.

### H6 — HTML injection into notification emails (phishing)
**File:** `services/email_service.py` (f-string bodies, e.g. :97-110, :115-127, :157-166, :218-231, :249-259, :311-322)

**Description.** User-supplied free text — `correction_notes`, `rejection_notes`, `change_summary`, `form_name`, names — is interpolated into HTML email bodies with no escaping.

**Impact.** A lower-privileged initiator/approver can inject markup and attacker-controlled `<a href>` links into emails delivered to managers, HODs, and executives inside the trusted "FlowDesk" template — convincing phishing and content spoofing.

**Fix.** HTML-escape every interpolated value (`html.escape(...)`), or render via Jinja2 with `autoescape=True`. Treat no DB text field as safe HTML.

### H7 — Business logic: self-approval is possible
**Files:** `routers/approvals.py:96-136` (`approve`), submission `routers/forms.py:127` (`selected_approver_ids`)

**Description.** The approve path checks only org scoping and `approver_user_id == current_user.id`. Nothing prevents an initiator from selecting themselves as an approver on their own form and approving it.

**Impact.** A user can submit a request, assign themselves as approver, and approve it — defeating the entire approval control.

**Fix.** Reject approval when the acting user is the instance's `created_by`. Validate `selected_approver_ids` at submission so the initiator cannot be chosen as their own approver.

### H8 — Unauthenticated organization creation + `subscription_plan` mass assignment
**Files:** `routers/organizations.py:19-36`, `schemas/organization.py:9`

**Description.** `create_organization` has no auth dependency (by design comment) and does `Organization(**payload.model_dump())`, where the client-supplied body includes `subscription_plan`.

**Impact.** Any anonymous caller can create unlimited organizations (resource exhaustion / cost abuse) on any billing tier (`subscription_plan="enterprise"`), bypassing billing.

**Fix.** Gate the endpoint behind a provisioning secret or platform-super-admin dependency (or disable it once the deployment's single org exists). Remove `subscription_plan` from `OrganizationCreate` and set the plan server-side.

### H9 — JWT stored in `localStorage` (XSS token theft)
**Files:** `frontend/src/api/client.js:9`, `frontend/src/context/AuthContext.jsx:11,17`, `frontend/src/pages/Login.jsx:61`

**Description.** The access token (`fd_token`) is persisted in `localStorage` and read back to build the `Authorization` header on every request. There is no CSP to constrain script execution.

**Impact.** Any XSS (including a future regression or a supply-chain payload) can read `localStorage.getItem('fd_token')` and exfiltrate a fully valid session token. `localStorage` is readable by all JS on the origin and persists across sessions.

**Fix.** Prefer an `httpOnly`, `Secure`, `SameSite=Strict` cookie set by the backend so JS cannot read the token; add CSRF protection accordingly. If localStorage must remain, add a strict `Content-Security-Policy` to shrink the XSS surface and treat it as a documented residual risk.

---

## MEDIUM

### M1 — `must_reset_password` is never enforced server-side
**Files:** `core/security.py:56-92`, `routers/auth.py:77-80`

`/login` issues a full, valid access token even when `must_reset_password` is true, and neither `get_current_user` nor `get_current_active_user` checks the flag. The "forced reset" is enforced only by the frontend redirect. A user (or anyone holding an admin-issued temp password) can ignore the reset and call every API with the token. **Fix:** in `get_current_active_user`, if `must_reset_password` is set, reject all requests except the force-reset and logout endpoints (e.g. via a dedicated dependency or middleware).

### M2 — IDOR: any user can read any other user's full profile
**File:** `routers/users.py:186-200` (`get_user`)

Docstring says "self or admin," but the code scopes only by org. Any active user can `GET /users/{any_id}` and receive email, status, department, full manager/HOD hierarchy, roles, and MFA-enabled flag — org-wide directory and role enumeration (useful for targeting finance/admin holders). `UserResponse` correctly omits secrets, so this is profile disclosure, not credential leak. **Fix:** allow only when `user_id == current_user.id` or caller is admin.

### M3 — Second path traversal via generated-document filename
**File:** `services/document_service.py:262`

`filename = f"{form_instance.reference_number.replace('/', '-')}_final.pdf"` strips only `/`, not `..` or Windows `\`. `reference_number` derives from admin-set `code_suffix` (`services/form_service.py:22`) with no sanitization, so a crafted suffix can escape `MEDIA_DIR/documents/<org>` on the win32 deployment. **Fix:** `re.sub(r'[^A-Za-z0-9._-]', '_', reference_number)`, validate `code_suffix` against `^[A-Z0-9]{2,8}$` at creation, and assert the realpath stays under the target dir.

### M4 — Signature image decompression bomb (DoS)
**Files:** `services/pdf_overlay_service.py:70-73,290-292`, `services/document_service.py:60-61`

Client-submitted base64 `signature_data` is decoded and handed to reportlab `ImageReader`/`Image`/PIL with no size or pixel-count limit. A small crafted PNG (huge dimensions) can exhaust memory/CPU during PDF generation on the approval-completion path. **Fix:** cap the decoded byte length and validate dimensions (`Image.MAX_IMAGE_PIXELS` + explicit max width/height) before rendering; cap signature payload size at upload.

### M5 — Plaintext temporary password in response body and email
**Files:** `schemas/user.py:71` (`TempPasswordResponse.temp_password`), returned `routers/users.py:125,169`; emailed `services/email_service.py:96-129`

The one-time password is returned in an API response (lands in proxy/access logs, browser history, telemetry) and emailed in cleartext (persists in mailboxes, SMTP logs, backups). **Fix:** deliver only via a single-use, short-expiry reset link (the token flow already exists); if an on-screen reveal is required, gate it tightly and exclude it from logging.

### M6 — No file size or content-type limits on uploads
**Files:** `routers/forms.py:169-194` (PDF template), `:532-597` (attachments)

Both stream to disk with no byte cap and weak/no type validation (`upload_pdf_template` accepts `application/octet-stream`; attachments accept anything). nginx caps at 25M, but the app enforces nothing. **Fix:** enforce a server-side max size and an allowlist; validate PDF magic bytes.

### M7 — API docs and OpenAPI schema exposed
**Files:** `main.py:60-61`, `nginx/nginx.conf:54-63`

`/docs`, `/redoc`, and `/openapi.json` are unconditionally enabled and deliberately proxied publicly by nginx — full endpoint/parameter enumeration plus a live request console. **Fix:** disable when `ENVIRONMENT=production` (`docs_url=None, redoc_url=None, openapi_url=None`) and remove the nginx locations, or gate behind internal-only access.

### M8 — No TLS and missing security headers at the edge
**Files:** `nginx/nginx.conf:1-2` (`listen 80` only, no `add_header`), `.env.production` (`REQUIRE_HTTPS=false`, `FRONTEND_URL=http://…`)

Everything is plain HTTP: JWTs and credentials travel in clear text on the LAN, and there is no HSTS/CSP/`X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy`. **Fix:** terminate TLS (443 + 80→443 redirect), add HSTS, a restrictive CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; set and enforce `REQUIRE_HTTPS=true`.

### M9 — Containers run as root
**Files:** `Dockerfile` (no `USER`), `Dockerfile.nginx` (no `USER`)

Neither image drops privileges; the app runs as UID 0. Combined with the upload/write primitives (H2), a code-execution bug escalates to root-in-container. **Fix:** add a non-root user (`adduser --system app` + `USER app`) on an unprivileged port; consider `read_only: true` root FS and `cap_drop: [ALL]`.

### M10 — Production container runs `uvicorn --reload`
**File:** `Dockerfile:18`

The only container command uses `--reload` — a dev file-watcher with extra attack surface and high resource use, not production-hardened. **Fix:** remove `--reload`; run `uvicorn --workers N` (or gunicorn + uvicorn workers). Use a compose override for local dev reload.

### M11 — `python-jose 3.3.0` unmaintained + JWE DoS CVE; `python-multipart 0.0.9` DoS CVE
**File:** `requirements.txt:10,12`

`python-jose 3.3.0` is affected by CVE-2024-33664 (JWE decompression memory-bomb DoS) and is unmaintained. *Note:* the classic algorithm-confusion CVE-2024-33663 is **not directly exploitable here** because `decode_token` pins `algorithms=[settings.ALGORITHM]` (HS256 only) — but migrating off the library is still advised. `python-multipart 0.0.9` is affected by CVE-2024-53981 (multipart-parse resource exhaustion; reachable via file uploads). **Fix:** migrate to `PyJWT`; upgrade `python-multipart>=0.0.18`.

### M12 — Stateless JWT: no revocation; token survives password reset
**Files:** `core/security.py`, `routers/auth.py:182-206`

Tokens are stateless with no denylist; changing or resetting a password does not invalidate previously issued access/refresh tokens (valid up to 60 min / 7 days). An attacker with a stolen token retains access even after the victim resets. **Fix:** add a token version/`jti` denylist or a per-user `token_valid_after` timestamp bumped on password change, and check it in `get_current_user`.

### M13 — Missing DB uniqueness constraint on `users.email`
**File:** `models/user.py:69`

`email` is `nullable=False` but has no `unique=True` / `UniqueConstraint(organization_id, email)`. Uniqueness is only enforced in application code on update (`routers/users.py:220-228`), which is race-prone and absent on create. Duplicate accounts create login/authorization ambiguity. **Fix:** add `UniqueConstraint("organization_id", "email")` and normalize case.

### M14 — Email header injection surface
**File:** `services/email_service.py:19-21,30-33`

`msg["Subject"]`, `msg["To"]`, and the attachment `filename` header are assigned raw with no CRLF stripping. Reachability is currently limited (inputs are mostly DB/system-controlled), but a malformed email record or an unsanitized `reference_number` (M3) could inject headers (`Bcc:`). **Fix:** use `EmailMessage`/`email.headerregistry`, validate recipients, strip `\r`/`\n` from all header inputs.

### M15 — `UserUpdate` accepts `status` and `role_ids` on the profile-update body
**Files:** `schemas/user.py:41-42`, `routers/users.py:217-231`

A single admin-gated endpoint mixes profile edits with role/status changes (activate account, grant `Admin`). It is admin-only and re-validates each role's org, so this is not direct anonymous escalation — but it is the escalation surface if any admin account is compromised, with no separation of duty. **Fix:** split role/status mutation into dedicated, separately-authorized endpoints and schemas.

### M16 — `OrganizationUpdate` lets a tenant admin change `subscription_plan` / `is_active`
**Files:** `schemas/organization.py:14-15`, `routers/organizations.py:66-67`

An org's own admin can upgrade the billing tier without billing, or toggle `is_active`. **Fix:** remove `subscription_plan` from the tenant-facing update schema; manage plan/active state via a privileged/billing path only.

### M17 — Approver can write field values for arbitrary field IDs
**File:** `routers/approvals.py:107-120`

`fv_input.form_field_id` is upserted into `FormFieldValue` without validating the field belongs to this form definition/version, letting an approver inject/overwrite unrelated field rows. **Fix:** validate each `form_field_id` is a field of the instance's definition and that `read_only`/`filled_by` permits approver edits.

---

## LOW

### L1 — Client formula engine uses `Function()` (guarded, fragile)
**File:** `frontend/src/utils/formulaEngine.js:54,81`

Both evaluators build `Function('"use strict"; return (' + expr + ')')()`, but a whitelist guard `/[^0-9+\-*/.()%\s]/` (lines 51, 79) rejects anything but digits/operators *after* all identifier substitution, so function calls cannot reach the evaluator — client-side code execution is effectively blocked. Residual risk is low but the design is fragile, and interpolated field names flow into `new RegExp(\`\\b${name}\\b\`)` unescaped (possible throw/ReDoS, caught by try/catch). **Fix:** replace `Function()` with a small arithmetic parser; escape names before `new RegExp`; keep the whitelist guard.

### L2 — `/force-reset-password` route not wrapped in an auth guard (frontend)
**File:** `frontend/src/App.jsx:45`

Renders outside `RequireAuth`; the page shell loads unauthenticated, though its POST requires a valid bearer token server-side (so no data exposure). Flagged for consistency. **Fix:** gate behind a lightweight authenticated check.

### L3 — Latent plaintext `temp_password` column
**File:** `models/user.py:82`

Code always writes `None`, so it is effectively dead, but the column invites accidental plaintext credential storage at rest. **Fix:** drop the column.

### L4 — LIKE-wildcard "injection" in reference-number counting
**File:** `services/form_service.py:16-19`

`.like(f"%-{code_suffix}-%")` — parameterized (not SQL injection), but `%`/`_` in `code_suffix` are unescaped, broadening the count and risking non-unique reference numbers. **Fix:** escape LIKE metacharacters (`ESCAPE`) or count on a dedicated indexed column.

### L5 — Arbitrary file read via `Signature.file_path`
**File:** `services/document_service.py:62-63`

The signature path from the DB is embedded without confirming it is under `MEDIA_DIR`; if any path ever lets a user influence `file_path`, an arbitrary local file could be rendered into a document. **Fix:** resolve and assert containment under the signatures dir before opening.

### L6 — Weak embedded bootstrap admin password
**File:** `.env:53` (`SUPER_ADMIN_PASSWORD=ChangeMe123!`)

A weak, well-known-pattern starter password ships in `.env` (and into the image via C2). Mitigated by forced first-login rotation *if* that rotation is truly enforced (see M1). **Fix:** leave blank so a random one is generated once.

### L7 — `passlib 1.7.4` unmaintained
**File:** `requirements.txt:11`

Last released 2020, no official bcrypt-4.x support (known compatibility noise), no security maintenance. **Fix:** hash directly via `bcrypt`/`argon2-cffi`, or pin a tolerated bcrypt version and plan migration.

### L8 — Recipient PII and raw exceptions logged on email failure
**File:** `services/email_service.py:52-54`

Prints recipient address and raw exception to stdout. **Fix:** use the app logger at reduced verbosity; avoid emitting recipient PII.

### L9 — Postgres reachable by any container on the shared `bsc_network`
**File:** `docker-compose.yml:8-15,55-58`

Port is `expose`d (not host-published — good), but any container on the shared external network can reach Postgres with the (weak) credentials from C1. **Fix:** use a dedicated db↔api network, strengthen the password, restrict membership.

---

## Verified NOT vulnerable (checked, no action needed)

- **No SQL injection.** All queries use the SQLAlchemy ORM with bound parameters; the only raw `text()` calls (`core/bootstrap.py`, `update_emails.py`) use DDL/bound params, not interpolated user input.
- **No `eval`/`exec`/`pickle`/unsafe YAML/XML** in the backend; `json.loads` used for table fields. No server-side formula evaluation.
- **Strong randomness/crypto:** `secrets.choice` temp passwords, `secrets.token_urlsafe(32)` reset tokens, bcrypt hashing, TOTP with correct pending-token exchange (password alone never yields a session).
- **JWT algorithm is pinned** to HS256 on decode (`algorithms=[settings.ALGORITHM]`) — no `alg=none`/asymmetric-confusion bypass.
- **No response schema leaks** `password_hash` or `mfa_secret`; `MFASetupResponse.secret` is the user's own enrollment secret by design.
- **Server-side password strength is enforced** on reset/force-reset (`validate_password_strength`, `auth.py:140,196`) — schema-level `min_length` is still recommended as defense in depth.
- **Email enumeration is mitigated** — `/forgot-password` returns a generic message regardless.
- **Env files were never committed to git** (only `.env.example` in history); `.gitignore` correctly excludes them.
- **Frontend:** no `dangerouslySetInnerHTML`/`innerHTML`/`document.write`, tokens not logged, axios does not disable TLS, no open-redirect from user input.
- **Mass assignment on user/org create** is safe — `organization_id`/`password_hash`/`id` are excluded and org is derived server-side; `update_user` re-validates each role's org.

## Non-security note (correctness)

`database/migrations/002_add_email_domain_to_organizations.sql:7` uses MySQL-only `ADD COLUMN ... AFTER`, and `database/seeds/002_roles.sql:32` uses MySQL `ON DUPLICATE KEY UPDATE` — these will fail on the PostgreSQL target the project now runs on.

---

## Remediation summary (applied 2026-07-03)

All findings below were fixed in code. Two items additionally require a human
operational step (marked ⚠️) that cannot be done from the repo.

### Critical
- **C1 — Exposed/baked-in secrets:** rotated `SECRET_KEY` in `.env` and
  `.env.production` (old keys are now dead); removed `!.env` from `.dockerignore`
  so no env file is ever copied into an image layer; blanked the weak
  `SUPER_ADMIN_PASSWORD` so a strong random one is generated once at startup.
  ⚠️ **Rotate the live Postgres password** (`ALTER ROLE flowdesk_app PASSWORD …`)
  and update `DB_PASSWORD`/`DATABASE_URL` — this can't be done from the repo.
- **C2 — Unauthenticated `/media`:** removed the public `StaticFiles` mount
  (`main.py`) and the nginx `/media/` proxy. Documents are served only via the
  authenticated, authorized routes.

### High
- **H1 — No rate limiting:** added `slowapi` (`core/ratelimit.py`); `/auth/login`,
  `/auth/mfa/verify`, `/auth/force-reset-password`, `/auth/reset-password`
  (10/min) and `/auth/forgot-password` (5/min) are now throttled per client IP.
- **H2 — Attachment path traversal / unbounded upload:** stored name is now
  `uuid + validated-extension` only (never the client filename), with an
  extension allowlist and a streamed hard size cap.
- **H3 / H4 — IDORs:** `documents.py` download and `forms.py` get-instance now
  require admin, initiator, or an explicit share/approver relationship.
- **H5 — CORS:** explicit `ALLOWED_ORIGINS` from settings; no wildcard+credentials.
- **H6 — Email HTML injection:** every user value is `html.escape`d; recipient/
  subject/filename headers are CRLF-stripped.
- **H7 — Self-approval:** blocked at submit/resubmit (can't pick yourself) and
  defensively at the approve step.
- **H8 — Unauthenticated org creation:** now admin-only; `subscription_plan` is
  set server-side, never from the client.
- **H9 — JWT in localStorage:** mitigated with a strict `Content-Security-Policy`
  (nginx) plus `X-Frame-Options`/`nosniff`/`Referrer-Policy`. Full httpOnly-cookie
  migration is a larger change left as a documented residual.

### Medium
- **M1 — Forced-reset not enforced:** `require_password_reset_complete` gate on all
  business routers; `/auth/me` + force-reset stay reachable so the user can rotate.
- **M2 — Profile enumeration:** `get_user` is now self-or-admin only.
- **M3 — Generated-filename traversal:** `reference_number` sanitized to an
  allowlist + realpath containment check.
- **M4 — Signature decompression bomb:** byte + pixel caps before rendering;
  `PIL.MAX_IMAGE_PIXELS` set.
- **M5 — Plaintext temp password:** one-time on-screen display to the creating
  admin retained (over TLS); logging of it removed.
- **M6 — Upload limits:** size caps + type validation on attachments and PDF
  templates (magic-byte check).
- **M7 — Docs exposed:** `/docs`, `/redoc`, `/openapi.json` disabled when
  `ENVIRONMENT=production`; nginx no longer proxies them.
- **M8 — TLS/headers:** security headers added in nginx. ⚠️ **Provision TLS
  certificates** and add the 443 server block at the edge (infra step).
- **M9 — Root containers:** API image now runs as a non-root `appuser`.
- **M10 — `--reload` in prod:** replaced with `--workers 4`.
- **M11 — Vulnerable deps:** replaced `python-jose` with `PyJWT`, bumped
  `python-multipart` to 0.0.18; decode pins `algorithms=[HS256]`.
- **M12 — Token survives password change:** tokens carry `iat`; a
  `password_changed_at` timestamp (set on every password change, incl. admin
  reset) invalidates older tokens.
- **M13 — Email uniqueness:** DB-level `UniqueConstraint(organization_id, email)`
  (added to the model and via idempotent `ALTER` in bootstrap for live DBs).
- **M14 — Header injection:** CRLF stripping on all email headers.
- **M15 / M16 — Mass assignment:** `subscription_plan` removed from tenant
  create/update schemas; org plan set server-side.
- **M17 — Approver arbitrary field write:** field IDs validated against the form
  definition before upsert.

### Low
- **L1** formula-engine RegExp inputs escaped. **L2** force-reset route now
  requires a logged-in user. **L3** plaintext `temp_password` column dropped
  (model + bootstrap `ALTER`). **L4** LIKE metacharacters escaped. **L5**
  signature `file_path` constrained under the media dir. **L6** weak bootstrap
  password blanked. **L7** noted — production pins `bcrypt==4.1.2` (works);
  migrating off passlib is the durable fix. **L8** recipient PII removed from
  error logs. **L9** DB network hardening is deployment-side.

### Schema migration note
The new `password_changed_at` column, the `users(organization_id, email)` unique
constraint, and the drop of `temp_password` are applied to existing databases by
idempotent `ALTER TABLE … IF (NOT) EXISTS` statements in `core/bootstrap.py`
(run on every startup), since `create_all()` never alters existing tables.

### Operational actions still required (not code)
1. ⚠️ Rotate the live Postgres password and update `.env.production`.
2. ⚠️ Terminate TLS at the edge (certs + 443 + HTTP→HTTPS redirect); set
   `REQUIRE_HTTPS=true`.
3. Rebuild images/containers so the rotated `SECRET_KEY` takes effect (this logs
   every user out once — expected).
