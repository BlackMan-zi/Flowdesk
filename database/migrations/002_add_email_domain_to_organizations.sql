-- Migration 002: Add email_domain column to organizations
-- This allows the system to resolve an organisation from a user's email
-- without requiring the user to enter a subdomain at login.

-- PostgreSQL syntax (the deployment target). PostgreSQL has no column ordering
-- clause, so no "AFTER". UNIQUE is added as a separate constraint.
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255);

ALTER TABLE organizations
    ADD CONSTRAINT uq_organizations_email_domain UNIQUE (email_domain);

-- Backfill BSC Rwanda
UPDATE organizations SET email_domain = 'bsc.rw' WHERE id = 'org-bsc-001';
