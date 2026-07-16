-- Migration 020: trusted devices for per-device MFA "remember me".
--
-- After verifying a TOTP code, a user can opt to trust the current
-- browser/device, storing a hashed opaque token here. A future login from
-- that same device (same token) skips MFA for org.mfa_reauth_days days,
-- computed live from created_at (not a stored expires_at), so changing the
-- org setting affects already-trusted devices immediately. Any other
-- device is always challenged, same as if it were never configured.

CREATE TABLE IF NOT EXISTS trusted_devices (
    id VARCHAR(36) PRIMARY KEY,
    organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    label VARCHAR(255),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_trusted_devices_user ON trusted_devices(user_id);
