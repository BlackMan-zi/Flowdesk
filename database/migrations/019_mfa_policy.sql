-- Migration 019: org-wide MFA policy (persistent toggle + re-auth grace period).
--
-- require_mfa_for_all: when true, every login in this org is challenged for
-- MFA regardless of the per-user mfa_required flag (see routers/auth.py).
-- New users are covered automatically since this is checked live at login,
-- not copied onto individual user rows.
--
-- mfa_reauth_days: NULL means "always challenge" (today's behavior). A
-- positive value skips the challenge if the user's mfa_verified_at is within
-- that many days.
--
-- users.mfa_verified_at: stamped only when a TOTP code is actually verified
-- (enable_mfa / verify_mfa in routers/auth.py), not on every login.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS require_mfa_for_all BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS mfa_reauth_days INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP;
