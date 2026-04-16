-- ============================================================
-- Migration 002: Add email_domain to organizations,
--                split into demo + bsc orgs,
--                add admin@demo.com user
-- Run this against the live FlowDesk database once.
-- ============================================================

-- 1. Add email_domain column if it doesn't exist
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255) UNIQUE NULL
  COMMENT 'Auto-detects organisation on login from email domain';

-- 2. Set email_domain on existing BSC Rwanda org
UPDATE organizations
SET subdomain    = 'bsc',
    email_domain = 'bsc.rw',
    updated_at   = NOW()
WHERE id = 'org-bsc-001';

-- 3. Insert the demo organisation (admin-only)
INSERT INTO organizations (id, name, subdomain, email_domain, subscription_plan, is_active, created_at, updated_at)
VALUES ('org-demo-001', 'FlowDesk Demo', 'demo', 'demo.com', 'enterprise', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE email_domain = VALUES(email_domain);

-- 4. Create admin@demo.com user in the demo org
--    Password: FlowDesk@2024
INSERT INTO users (id, organization_id, name, email, password_hash, department_id, status, must_reset_password, created_at)
VALUES (
  'usr-demo-admin',
  'org-demo-001',
  'System Admin',
  'admin@demo.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaJobMR/tHvGmcf5TWVNQ7IiO',
  NULL,
  'Active',
  0,
  NOW()
)
ON DUPLICATE KEY UPDATE organization_id = 'org-demo-001', email = 'admin@demo.com';

-- 5. Ensure admin@demo.com has the admin role
INSERT IGNORE INTO user_roles (id, user_id, role_id)
VALUES (UUID(), 'usr-demo-admin', 'role-admin');

-- 6. Update BSC staff emails: @bsc.demo → @bsc.rw (if not already done)
UPDATE users
SET email = REPLACE(email, '@bsc.demo', '@bsc.rw')
WHERE organization_id = 'org-bsc-001'
  AND email LIKE '%@bsc.demo';

-- 7. Verify
-- SELECT id, name, subdomain, email_domain FROM organizations;
-- SELECT id, name, email FROM users WHERE email IN ('admin@demo.com') OR organization_id = 'org-demo-001';
