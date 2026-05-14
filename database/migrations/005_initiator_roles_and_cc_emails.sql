-- Migration 005: initiator role restriction on forms + email-based CC recipients
-- 1. form_definition_initiator_roles: junction table for restricting who can initiate a form.
--    If a form has no rows in this table, it is open to all users (default).
--    If it has rows, only users holding at least one of those roles can see/submit it.
-- 2. approval_template_cc_recipients.email: free-text email recipients (distribution lists, externals).
-- 3. Extend RoleType enum to include 'Email' for email-based CC recipients.

CREATE TABLE IF NOT EXISTS form_definition_initiator_roles (
    form_definition_id VARCHAR(36) NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
    role_id            VARCHAR(36) NOT NULL REFERENCES roles(id)            ON DELETE CASCADE,
    PRIMARY KEY (form_definition_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_fd_init_roles_role ON form_definition_initiator_roles (role_id);

ALTER TABLE approval_template_cc_recipients
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Extend the roletype enum with 'Email' (PostgreSQL: ADD VALUE is idempotent with IF NOT EXISTS)
ALTER TYPE roletype ADD VALUE IF NOT EXISTS 'Email';
