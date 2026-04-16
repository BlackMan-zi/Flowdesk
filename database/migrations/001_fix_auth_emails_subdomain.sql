-- ============================================================
-- Migration 001: Fix authentication — update org subdomain
--                and user email domains
-- Date: 2026-04-16
-- Run this against the live FlowDesk database once.
-- ============================================================

-- 1. Change BSC Rwanda subdomain from 'bsc' → 'demo'
--    (admin@demo.com login uses org subdomain 'demo')
UPDATE organizations
SET subdomain = 'demo', updated_at = NOW()
WHERE id = 'org-bsc-001' AND subdomain = 'bsc';

-- 2. Update all BSC Rwanda user emails: @bsc.demo → @bsc.rw
UPDATE users
SET email = REPLACE(email, '@bsc.demo', '@bsc.rw')
WHERE organization_id = 'org-bsc-001'
  AND email LIKE '%@bsc.demo';

-- 3. Verify — run these SELECTs to confirm:
-- SELECT id, subdomain FROM organizations WHERE id = 'org-bsc-001';
-- SELECT id, name, email FROM users WHERE organization_id = 'org-bsc-001' ORDER BY name;
