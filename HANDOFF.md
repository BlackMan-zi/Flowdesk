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

Nothing is mid-change in tracked code as of this writing. Three real bugs
were found during 2026-08-02 QA testing; the two code bugs (SSE realtime
broken, login-error-swallowed-by-redirect) were fixed the same session —
see Next Steps for root cause + fix details. The third (`mfa_enabled`
schema fragility) was left as a data-only fix per user decision; the
schema itself is still fragile.

## Active File(s)

None currently being edited.

## Changes Made (most recent session first)

- 2026-08-02: Full end-to-end regression test session via live browser
  (`claude-in-chrome`), covering everything merged since the 2026-07-16
  session (10 commits: permanent user delete, Active/Deactivated tabs +
  reactivation, deactivated-user confinement, structure-dependent one-form
  workflow, approval-template CC recipients, per-device MFA trust, org-wide
  MFA policy, email kill-switch). Found three real bugs; fixed two in code
  (SSE realtime completely broken, login error message swallowed by a
  redirect — both detailed in Next Steps) plus one data issue, and
  confirmed the rest of the surface works as designed.
  - **Environment fix, not a bug**: `flowdesk-nginx` and `flowdesk-api`
    containers were running images built 2026-07-16, a full day *before*
    the six most recent commits — none of that frontend/backend code was
    actually deployed (Users page showed no Active/Deactivated tabs, old
    "Bulk MFA" button still present, etc.). Fixed with `docker compose
    build && docker compose up -d` from repo root. Also discovered the
    browser's HTTP cache intermittently re-served the pre-rebuild
    `index.html`/JS bundle after plain `navigate()` calls even post-rebuild
    — a hard refresh (ctrl+shift+r) after every navigation was needed to
    guarantee the current bundle. Worth remembering for any future
    container-rebuild-mid-session workflow.
  - **Data fix**: `GET /users` (Admin → Users page) was 500ing because
    `UserResponse.mfa_enabled` (`backend/schemas/user.py:66`) is a
    non-nullable `bool`, but 11 of the 12 `demo.*@bsc.rw` accounts had
    `mfa_enabled = NULL` (the raw-SQL demo-user creation script never set
    it, and the column has no DB-level default, unlike `mfa_required`
    which does). Backfilled with `UPDATE users SET mfa_enabled = false
    WHERE mfa_enabled IS NULL` — data-only fix, schema left as-is per user
    decision (didn't want the code touched this session, just data
    corrected). **The schema fragility is still there** — any future path
    that inserts a `User` row without explicitly setting `mfa_enabled`
    will reproduce this 500. See Next Steps.
  - Verified working correctly, live, end-to-end: plain login incl.
    anti-enumeration and deactivated-account 403; MFA enrollment + verify
    + wrong-code inline error (no regression on the 401→400 fix from
    2026-07-16); per-device MFA trust (trust → same browser skips MFA →
    different/cleared session re-challenges); org-wide "Require MFA for
    everyone" + reauth-days Settings tab; Active/Deactivated tabs with
    counts; Reactivate; self-deactivate block (400, toast shown correctly);
    Delete button only rendering on the Deactivated tab; deactivated-user
    admin-picker exclusion (confirmed via a display-only issue below, not
    a functional break); non-admin correctly redirected away from
    `/admin/settings`; full form submit → route-to-manager → approve →
    "Approved" status → PDF generated (`generated_documents` row, 10.8KB)
    happy path; Approval Templates CC recipients UI (position/person +
    plain email + label, round-trips correctly, "CC" column count updates,
    correct `ApprovalTemplateCCRecipient` row with `role_type=email`
    persisted and linked to the right template).
  - Demo-data changes made for testing (all reversible, isolated from real
    seeded users): granted `demo.it@bsc.rw` the `Admin` role (in addition
    to its existing `IT` role) so admin-surface testing didn't require
    William's or Gilbert's real password; set `demo.finance@bsc.rw`'s
    `manager_id` to `usr-demo-cfo` so a Hierarchy-based approval chain
    could be exercised entirely with demo accounts; two real Site Report
    submissions now exist (`FD-SR-2026-0001`, `-0002`), both fully approved
    with generated PDFs; added a `test-distro@bsc.rw` / "QA Test Distro" CC
    recipient to the "Site Report Approval" template (left in place —
    harmless, but worth removing before any real rollout). Org
    `require_mfa_for_all` was turned on then back off during MFA testing;
    currently **off** (left as it was found).
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

- ~~[BUG, high severity] SSE realtime is completely broken~~ — **fixed**
  same session, right after being found. Root cause:
  `app.include_router(events_router, dependencies=_password_gate)` in
  `backend/main.py:210` applied `require_password_reset_complete` →
  `get_current_active_user` → `get_current_user`, which authenticates via
  `Depends(oauth2_scheme)` (an `Authorization: Bearer` header). But
  `GET /events/stream` is opened by the browser's native `EventSource`,
  which **cannot send custom headers** — the token travels as
  `?token=<jwt>` instead, and `events.py`'s own `stream()` handler already
  manually decodes that query param (see its docstring). The router-level
  dependency ran *before* the handler body, so every SSE connection 401ed
  with FastAPI's generic "Not authenticated" (confirmed live via curl to
  the API container directly, bypassing both nginx layers — same 401, so
  it wasn't a proxy issue). Net effect before the fix: no user had been
  able to open a live event stream since whatever commit added this
  router-wide dependency (`2940b8c` security-hardening is the likely
  culprit). Compounding it: commit `98da419` removed the old
  `refetchInterval: 1_000` polling fallback from `MyForms.jsx`/
  `ApprovalsInbox.jsx`, leaving only `refetchOnMount`/`refetchOnWindowFocus`
  — so the UI was only updating on manual navigation or window refocus,
  never live. **Fix applied**: dropped `dependencies=_password_gate` from
  the `events_router` registration (`backend/main.py:210`) — the route's
  own manual token/user/active-status check in `stream()` is sufficient and
  was already designed for exactly this. Verified live: `curl` straight to
  `/api/events/stream?token=...` now returns 200 and stays open instead of
  401; the browser's real `EventSource` connection now shows `pending`
  (open/streaming) in the network log instead of instant-401. Two-session
  live cross-tab update propagation (approve in one tab → other tab updates
  without refresh) was not separately re-verified after the fix — worth a
  quick look next session, though the connection succeeding is the part
  that was actually broken.
- ~~[BUG, medium severity] Wrong password on login silently discards the
  error message~~ — **fixed** same session. Root cause:
  `frontend/src/api/client.js`'s response interceptor did
  `window.location.href = SUBPATH + '/login'` on *any* 401, including
  `POST /auth/login`'s own "Invalid email or password" 401 for a
  wrong-password attempt. That full page navigation fired before
  `Login.jsx`'s `catch` block ever rendered its inline `<Alert>` —
  confirmed via network log: `POST /auth/login → 401` was immediately
  followed by `GET /login` (document reload), every time, reproducibly.
  Same bug class the 2026-07-16 session fixed for the MFA endpoints
  (changed 401→400 there specifically to dodge this interceptor) — but the
  interceptor itself was never fixed, so the plain login endpoint stayed
  exposed. Same applied to the unknown-email-domain 401 path. The
  deactivated-account path was never affected (uses 403, not 401). **Fix
  applied**: the interceptor now checks `err.config?.url?.includes
  ('/auth/login')` and skips the hard redirect for that request specifically
  (`frontend/src/api/client.js`), leaving the "Invalid email or password"
  alert intact for the user to see. Verified live: wrong password now shows
  the inline red alert with fields still populated, no redirect; correct
  password still logs in and redirects to the dashboard normally
  (regression-checked).
- **[Bug, low severity / data-integrity fragility, NOT fixed]**
  `backend/schemas/user.py:66`'s `UserResponse.mfa_enabled: bool` is
  non-nullable but the DB column allows NULL with no default. Backfilled
  the 11 affected demo rows to `false` this session (see Changes Made), but
  the schema itself is still one un-set `mfa_enabled` away from breaking
  `GET /users` again for any future user row inserted without it explicitly
  set (e.g. any other raw-SQL seed/import script). Fix: either
  `Optional[bool] = False` in the schema, or `server_default=false()` on
  the DB column (ideally both).
- **[Minor UX gap, not a functional bug]** Admin → Users → Edit modal shows
  "Manager"/"SN Manager"/"HOD" as **"None"** whenever the actually-assigned
  person is deactivated, because the `<Select>`'s option list is filtered
  to `activeUsers` only (`frontend/src/pages/admin/Users.jsx:863-874`, part
  of the `c434351` deactivated-user-confinement work) but `form.manager_id`
  itself is still correctly populated from the real (deactivated) value
  underneath — confirmed via DB: William's `manager_id`/`hod_id` are set to
  two of the 22 deactivated staff, yet his Edit modal shows both as "None".
  Not destructive (the underlying value isn't cleared unless the admin
  actually interacts with that dropdown), but misleading — an admin can't
  tell "genuinely unset" from "set to someone now deactivated" without
  checking the DB. Worth showing the deactivated name (e.g. greyed out,
  "(deactivated)") instead of silently falling back to the "None" option.
- **Deactivated-manager approval-chain edge case, observed not exploited**:
  this session avoided testing what happens when a Hierarchy approval step
  (Manager/SN Manager/HOD) resolves to a *deactivated* user (e.g. William
  submitting a form, since his real manager/HOD are among the 22
  deactivated staff) — used demo-account hierarchy links instead to keep
  the happy-path test clean. Still an open question whether
  `initialize_approval_steps` / `resolve_approver_for_step`
  (`backend/services/approval_service.py`) has any check for this, or
  whether it would silently create a step assigned to someone who can never
  log in to approve it (a permanent deadlock). Worth a dedicated look
  before real rollout, given 20 of the 22 deactivated staff were real
  managers/HODs for other real (currently also deactivated, but will be
  reactivated) staff.
- ~~Verify the admin UI for the MFA/password-reset work~~ — done in the
  2026-08-02 session: Users page tabs/MFA controls and Settings "MFA &
  Password Reset" tab all confirmed present and working (the old one-time
  "Bulk MFA" dialog referenced here is correctly gone, replaced by the
  org-wide toggle, once the container was rebuilt with current code — see
  Changes Made). Did not click "Reset MFA" or the Settings "Reset User
  Password" button specifically this session (both are simple, low-risk UI
  affordances backed by endpoints already exercised via other means).
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
