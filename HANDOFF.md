# FlowDesk — Handoff

> Read this file first, every time you open this project. Keep it updated as work
> progresses — update the relevant section(s) whenever you make a change, hit a
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
- Most recent merged work: PR #2 "security-hardening" — comprehensive hardening
  across auth, access control, uploads, and infra (commit `2940b8c`, merged in
  `8b68b25`). Before that: SSE-driven realtime replacing 1s polling, and an
  nginx `/api` prefix-strip fix.
- Four reference/spec markdown docs sit **untracked** at repo root (not yet
  committed or reviewed for whether they belong in git):
  - `FLOWDESK_BLUEPRINT.md` — full system blueprint (architecture, DB, API
    catalogue, security, deployment, go-live checklist).
  - `FLOWDESK_PAGES.md` — page-by-page reference.
  - `MFA.md` — TOTP two-factor auth feature doc (admin-configurable, off by
    default, includes an SSH kill-switch script for lockout emergencies).
  - `Temp-Password-Auth-Pattern copy.md` — reusable admin-managed
    temp-password / forgot-password pattern write-up.
- `docker-compose.override.yml` is a local-only, gitignored file that publishes
  nginx on host port 8099 (port 80 is taken by `bsc-proxy` on this shared
  machine).

## In Progress

Nothing is mid-change in tracked code as of this writing. The only open item
is the four untracked docs above — no decision has been made yet on whether to
commit them, and where (e.g. `docs/`).

## Active File(s)

None currently being edited.

## Changes Made (most recent session first)

- 2026-07-04 — Created this HANDOFF.md and added a pointer in `CLAUDE.md`
  instructing every session to read it first. No product code touched.

## Failed Attempts

None recorded yet. When something is tried and abandoned, log it here with a
one-line reason so it isn't retried blindly:
`- <what was tried> — <why it didn't work>`

## Next Steps

- Decide whether `FLOWDESK_BLUEPRINT.md`, `FLOWDESK_PAGES.md`, `MFA.md`, and
  `Temp-Password-Auth-Pattern copy.md` should be committed (and where), or
  stay local-only reference material.
- No other open threads — pull the next task from the user/project backlog.
