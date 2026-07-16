-- Migration 016: password_changed_at + unique(organization_id, email)
--
-- password_changed_at backs token invalidation: core.security.get_current_user
-- rejects any JWT whose iat predates this timestamp, so rotating a password
-- (self-service or admin-triggered) immediately kills stolen/old tokens.
--
-- The unique constraint closes a create-time race: email uniqueness was only
-- checked in application code, which two concurrent inserts can both pass.
-- Wrapped in a DO block because Postgres has no
-- "ADD CONSTRAINT IF NOT EXISTS", and if a live database already holds
-- duplicate (organization_id, email) rows, this constraint would fail; the
-- app's migration runner catches that per-file and logs a warning rather
-- than crashing startup, so it is safe to ship even if it can't apply yet.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_users_org_email'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT uq_users_org_email UNIQUE (organization_id, email);
    END IF;
END $$;
