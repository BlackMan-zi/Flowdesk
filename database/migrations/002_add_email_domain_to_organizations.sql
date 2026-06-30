-- Migration 002: Add email_domain column to organizations
-- This allows the system to resolve an organisation from a user's email
-- without requiring the user to enter a subdomain at login.

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255) UNIQUE NULL
    AFTER subdomain;

-- Backfill BSC Rwanda
UPDATE organizations SET email_domain = 'bsc.rw' WHERE id = 'org-bsc-001';
