-- Migration 015: form_definition_initiator_users
-- Junction table mirroring form_definition_initiator_roles, but for restricting
-- specific named users (not whole roles) as allowed initiators of a form.
-- A user is allowed to initiate iff: (no restrictions) OR (their role is listed)
-- OR (their user_id is listed). Empty rows in both tables => open to all.

CREATE TABLE IF NOT EXISTS form_definition_initiator_users (
    form_definition_id VARCHAR(36) NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
    user_id            VARCHAR(36) NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    PRIMARY KEY (form_definition_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_init_users_user ON form_definition_initiator_users (user_id);
