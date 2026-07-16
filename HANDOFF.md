# FlowDesk: Handoff

> Read this file first, every time you open this project. Keep it updated as work
> progresses: update the relevant section(s) whenever you make a change, hit a
> dead end, or finish a session, so the next session (or the next Claude) can
> resume without re-discovering context.

## Goal

FlowDesk is a multi-tenant SaaS platform that replaces paper/email approval
workflows (leave requests, purchase requisitions, training requests, etc.).
Staff submit forms, the system routes them through an approval chain, captures
signatures, generates a signed PDF, and archives everything with a full audit
trail. Stack: FastAPI (Python) backend, React 18 frontend, PostgreSQL 16,
Nginx reverse proxy, all in Docker Compose. Hosted on-prem at
`10.20.26.47/flowdesk/` behind the BSC reverse proxy.

## Current State

- Branch `main`, up to date with `origin/main`, working tree clean.
- Most recent merged work: PR #2 "security-hardening", comprehensive hardening
  across auth, access control, uploads, and infra (commit `2940b8c`, merged in
  `8b68b25`). Before that: SSE-driven realtime replacing 1s polling, and an
  nginx `/api` prefix-strip fix.
- Four reference/spec markdown docs live at repo root. Despite earlier notes
  in this file, they are **already tracked** (added in commit `f8ee02c`,
  "docs: add project handoff/instructions and system reference docs"):
  - `FLOWDESK_BLUEPRINT.md`: full system blueprint (architecture, DB, API
    catalogue, security, deployment, go-live checklist).
  - `FLOWDESK_PAGES.md`: page-by-page reference.
  - `MFA.md`: TOTP two-factor auth feature doc (admin-configurable, off by
    default, includes an SSH kill-switch script for lockout emergencies).
  - `Temp-Password-Auth-Pattern copy.md`: reusable admin-managed
    temp-password / forgot-password pattern write-up.
- `docker-compose.override.yml` is a local-only, gitignored file that publishes
  nginx on host port 8099 (port 80 is taken by `bsc-proxy` on this shared
  machine).
- **`localhost:8099/` does NOT work standalone for browsing the app.** The
  frontend is always built with `VITE_BASE_PATH=/flowdesk/` baked in
  (`Dockerfile.nginx`), so `index.html` references `/flowdesk/assets/...`.
  Only the outer `bsc-proxy` strips the `/flowdesk/` prefix
  (`location /flowdesk/ { rewrite ^/flowdesk/(.*) /$1 break; ... }`) before
  forwarding to `flowdesk-nginx`. Hitting port 8099 directly bypasses that
  strip, so the HTML loads (200) but every JS/CSS asset 404s and the page is
  blank. `bsc-proxy` already publishes host ports 80/443, so **use
  `http://localhost/flowdesk/`** to browse the app locally (port 8099 is
  only useful for things that don't care about the base path (e.g. curling
  `/api/health` directly)).

## In Progress

Nothing is mid-change in tracked code as of this writing.

## Active File(s)

None currently being edited.

## Changes Made (most recent session first)

- 2026-07-16 (latest session): William Manzi promoted to Admin (see below).
  Four pieces of work, all behind that new Admin access:
  1. **Admin manual password reset.** New `POST /users/{id}/reset-password`
     (`backend/routers/users.py`), admin-only, reuses `generate_temp_password`
     and the existing `send_password_reset_code_email`; always returns the
     generated password in the response (not just via email) so the admin
     can copy/share it manually. New "Reset User Password" card in
     `frontend/src/pages/admin/Settings.jsx`. `UserCreate` also gained a
     `send_welcome_email` flag so future ad-hoc user creation can skip email.
  2. **Working per-user MFA** (previous session had found `/auth/mfa/verify`
     was a hard-coded stub with no recovery path — permanently lockable).
     Rebuilt properly: new `mfa_required` column (admin intent, migration
     `017_mfa_required.sql`) decoupled from `mfa_enabled` (system-set,
     "enrollment confirmed"); login gates on `mfa_required` alone. New
     `mfa_pending` JWT type (`core/security.py`, 10 min) issued by
     `/auth/login`'s MFA branch, structurally rejected by every other route
     (`type` claim check). `/auth/mfa/setup` and `/auth/mfa/enable` now run
     on that pending token instead of self-service; `/auth/mfa/verify`
     actually works now. New admin endpoints: `PATCH /users/{id}/mfa-required`,
     `POST /users/{id}/mfa-reset` (blocked for self), `POST /users/mfa/apply-all`
     (bulk, single audit event). New `frontend/src/components/auth/MfaChallenge.jsx`
     (QR enrollment / code entry, inline in the login flow, no separate
     settings page for users to find) and MFA controls (toggle, badge,
     Reset MFA, Bulk MFA dialog) in `admin/Users.jsx`. **Bug caught and fixed
     during live testing:** invalid-code responses were `401`, which tripped
     `api/client.js`'s global interceptor (any `401` → hard redirect to
     `/login`, meant for expired sessions) and wiped the in-progress MFA
     state instead of showing an inline error — changed to `400` (also fixed
     the parallel `client.js` bug where the interceptor unconditionally
     overwrote any explicitly-set `Authorization` header, needed since MFA
     calls authenticate with the pending token, not `fd_token`). Verified
     live end-to-end via the demo HR test account: QR enrollment → real TOTP
     code (computed via `pyotp` in the container, no phone needed) → login
     completes → log out/in → plain code screen (no QR) → wrong code
     correctly rejected inline after the fix → correct code → login
     completes, `last_login` advances.
  3. **Twelve fabricated demo/trial users**, one password (`Demo2026!`),
     covering roles that had no real seeded holder or didn't exist yet
     (`backend/scripts/create_demo_trial_users.py`, run once): HR, HR &
     Admin, Finance, Supply Chain, IT, CFO, CEO, Chief Corporate, Chief
     Commercial (new role), Director PMO (reuses HOD), Legal (new role),
     Logistics (new role). All `demo.*@bsc.rw`, created via raw SQL only —
     never touches the HTTP API or email service, so zero email risk
     regardless of live SMTP. Note for reuse: this DB's `role_category` and
     `status` enum columns store the lowercase Python enum *name*
     (`executive`, `active`), not the display value (`Executive`, `Active`)
     — SQLAlchemy's default `Enum` behavior; got this wrong on the first
     run, single fixed run afterward, no partial-write cleanup needed
     (transaction rolled back cleanly).
  4. **Deactivated the 22 real seeded BSC Rwanda staff** (`UPDATE users SET
     status='not_active' WHERE organization_id='org-bsc-001' AND id NOT IN
     ('usr-corp-004','usr-ceo-001')`) so testing doesn't risk hitting real
     staff email addresses now that SMTP is live. Reversible — flip back to
     `active` when the system is approved for real rollout. William
     (`usr-corp-004`) and Gilbert Kayinamura (`usr-ceo-001`, the other
     seeded Admin) stay active. Also deleted a stray OneDrive
     sync-conflict file, `database/seeds/003_users-Black's MacBook Pro.sql`
     (same IDs as the real seed, different fabricated data — a real hazard
     if ever picked up by a fresh seed run).

  Also this session: granted William Manzi (`usr-corp-004`) the `Admin`
  role directly against the live DB (`SUPER_ADMIN_EMAIL` in `.env` turned
  out to be dead config — nothing reads it, no bootstrap-admin code path
  exists) and lowered the password policy minimum from 12 to 8 characters
  (`validate_password_strength` in `backend/services/auth_service.py`;
  also updated `FLOWDESK_BLUEPRINT.md`/`SECURITY.md`).

  **Not yet verified**: the admin-only UI surfaces (Users page MFA toggle/
  Reset MFA/Bulk MFA dialog, Settings page "Reset User Password" card) —
  needs a real admin session, which the assistant didn't have credentials
  for this session (William changed his own password between sessions).
  William will click through these himself.
- 2026-07-16 (earlier session): Replaced the link-based forgot-password flow
  with a temp-password/code flow, since the emailed link didn't work (root
  cause: `.env`'s `FRONTEND_URL` was `http://localhost:3000`, but the app is
  only reachable locally at `http://localhost/flowdesk` via `bsc-proxy` —
  fixed in `.env` and `.env.example`; `.env.production`'s value was already
  correct). New design: `POST /auth/forgot-password` now generates a 10-char
  readable code (`generate_temp_password` in `backend/services/auth_service.py`,
  alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, ~49.5 bits entropy), emails it
  via a new `send_password_reset_code_email` (`backend/services/email_service.py`),
  and only commits the account change (`password_hash`, `temp_password`,
  `must_reset_password=True`, `password_changed_at`) if the send actually
  succeeds (`_send_email` now returns `bool`) — an SMTP outage can never
  invalidate a still-working password, and the response is identically
  generic either way (anti-enumeration). The user then logs in normally with
  that code; the already-working `must_reset_password` → `/force-reset-password`
  flow takes over from there (zero changes needed to that page or to
  `Login.jsx`). Removed as dead code: `POST /auth/reset-password`,
  `PasswordResetRequest` schema, `generate_reset_token`,
  `send_password_reset_email`, `frontend/src/pages/ResetPassword.jsx`, the
  `/reset-password` route, and the `resetPassword` API export. Left the
  `PasswordResetToken` model/table in place, unused (no migration, avoids
  risk for a harmless orphan). `frontend/src/pages/ForgotPassword.jsx` copy
  updated to "temporary password" framing with a "Go to sign in" CTA.
  Verified live end-to-end with **real SMTP** (the user has since filled in
  real Office365 credentials in `.env`): request → real email sent (no
  `[EMAIL ERROR]` in `flowdesk-api` logs) → DB row updated only after send
  succeeded → login with the code → forced redirect to
  `/force-reset-password` → new password set → audit trail confirmed
  (`PASSWORD_RESET_REQUESTED` → `USER_LOGIN` → `PASSWORD_CHANGED`) → old
  `/auth/reset-password` route confirmed gone (404).
- 2026-07-16 (earlier session): Two pieces of work.
  1. **Forgot/reset password.** The backend (`POST /auth/forgot-password`,
     `POST /auth/reset-password`, `PasswordResetToken` model, rate limiting,
     anti-enumeration, `send_password_reset_email` in
     `backend/services/email_service.py`) and the API client functions
     (`frontend/src/api/auth.js`) already existed but were unused. Added the
     missing frontend: `frontend/src/pages/ForgotPassword.jsx` and
     `frontend/src/pages/ResetPassword.jsx` (the latter's requirements
     checklist matches the real backend policy: 12+ chars, upper, lower,
     digit, special char), two public routes in `frontend/src/App.jsx`, and
     a "Forgot password?" link on `frontend/src/pages/Login.jsx`. Verified
     live end-to-end via `claude-in-chrome`: request link, pull the token
     from `password_reset_tokens` (SMTP is still placeholder credentials so
     no real email sends, see Next Steps), weak-password rejection, strong
     password acceptance, login with the new password, and the
     invalid/expired-token error state. No backend or `.env` changes were
     needed or made.
  2. **Removed every prose em dash ("—") and prose double-hyphen** across
     the repo (root docs, `frontend/src/**`, `backend/**`, SQL
     migrations/seeds, and infra config comments) per user request, since
     they read as an AI-writing tell. ~700 occurrences across roughly 90
     files, done via ~19 parallel batch agents plus manual follow-up for a
     few files the sweep missed (`FormFillerCanvas.jsx`,
     `database/seeds/README.md`, `backend/scripts/test_delegate_all.py`).
     Deliberately left untouched: the bare `'—'` "empty value" placeholder
     glyph convention used throughout the UI/PDF exports (e.g.
     `x || '—'`), Mermaid diagram syntax (`}o--o{`), the `--accent` CSS
     custom property, CLI flag examples in comments, and decorative
     `--- Test N ---` print banners. `FLOWDESK_BLUEPRINT.md` and
     `FLOWDESK_PAGES.md` had their Table of Contents anchor links updated
     to match any heading text that changed. Verified with a full frontend
     `npm run build` (clean) and a final repo-wide grep (only intentional
     placeholder glyphs remain). Also corrected a stale claim in this file:
     the four reference docs (`FLOWDESK_BLUEPRINT.md` and friends) are not
     untracked; they were committed in `f8ee02c`.
- 2026-07-04: Created this HANDOFF.md and added a pointer in `CLAUDE.md`
  instructing every session to read it first. No product code touched.

## Failed Attempts

None recorded yet. When something is tried and abandoned, log it here with a
one-line reason so it isn't retried blindly:
`- <what was tried>: <why it didn't work>`

## Next Steps

- **Verify the admin UI** for the MFA/password-reset work above: Users page
  (MFA toggle per row, Enrolled/Pending badge, Reset MFA button, Bulk MFA
  dialog) and Settings page ("Reset User Password" card). Not yet clicked
  through this session.
- Once the system is approved for real rollout: flip the 22 deactivated
  real seeded BSC Rwanda staff back to `active`
  (`UPDATE users SET status='active' WHERE organization_id='org-bsc-001'
  AND status='not_active'` — but confirm this doesn't also reactivate
  anyone deliberately deactivated for other reasons in the meantime), and
  decide whether to keep or remove the 12 `demo.*@bsc.rw` trial users at
  that point.
- SMTP is now live in `.env` with real Office365 credentials (`SMTP_USER`/
  `SMTP_PASS` for `support@bsc.rw`) — forgot-password emails actually send
  locally now. `.env.production`'s `SMTP_USER`/`SMTP_PASS` are still blank
  ("disabled for now"); fill those in before relying on this in production.
  See the Microsoft 365 SMTP gotchas section in
  `Temp-Password-Auth-Pattern copy.md` if delivery issues come up (App
  Passwords needed if MFA is on the mailbox, SMTP AUTH may be disabled
  tenant-wide by default).
- No other open threads. Pull the next task from the user/project backlog.
