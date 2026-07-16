-- Migration 017: per-user "MFA required" flag, decoupled from mfa_enabled.
--
-- mfa_required: admin-set — must complete TOTP at login (see routers/auth.py).
-- mfa_enabled : now means "enrollment confirmed with a real code", not
--               "admin wants MFA" — that ambiguity was the root cause of a
--               lockout bug (toggling mfa_enabled alone with no mfa_secret
--               left a user with no reachable path to enroll or verify) and
--               a no-op bug (toggling mfa_enabled without a secret changed
--               nothing at login). Login now gates on mfa_required only.

ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE;
