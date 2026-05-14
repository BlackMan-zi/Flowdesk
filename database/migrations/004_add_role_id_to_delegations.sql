-- Migration 004: add role_id to delegations
-- Allows delegations to be scoped to a specific approval role.
-- If role_id is NULL the delegation covers all approval roles for that user.

ALTER TABLE delegations
    ADD COLUMN role_id VARCHAR(36) REFERENCES roles(id) ON DELETE SET NULL;
