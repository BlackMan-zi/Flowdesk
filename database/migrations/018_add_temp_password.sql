-- Migration 018: add missing users.temp_password column.
--
-- backend/models/user.py has defined temp_password since the temp-password/
-- code forgot-password flow was built, but no migration ever created it in
-- Postgres - it only ever existed via a fresh local dev DB's
-- Base.metadata.create_all() picking up the full current model. Production's
-- much older users table never got the column, breaking every login and
-- forgot-password request (UndefinedColumn: users.temp_password).
--
-- Nullable, matching the model (nullable=True) - it's write-only bookkeeping
-- of the most recently issued temp code, never compared against for auth
-- (that's password_hash), so no backfill is needed.

ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password VARCHAR(255);
