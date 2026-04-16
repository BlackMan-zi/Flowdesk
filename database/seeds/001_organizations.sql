-- ============================================================
-- FlowDesk Database Seed: Organizations & Departments
-- Version: 2.0
-- Updated: 2026-04-16
-- Description: Two organisations — demo (admin only) + BSC Rwanda (all staff)
-- ============================================================

-- ── Organizations ────────────────────────────────────────────
-- email_domain drives auto-org-detection on login (no org field needed)
INSERT INTO organizations (id, name, subdomain, email_domain, subscription_plan, created_at, updated_at)
VALUES
  ('org-demo-001', 'FlowDesk Demo', 'demo', 'demo.com', 'enterprise', NOW(), NOW()),
  ('org-bsc-001',  'BSC Rwanda',    'bsc',  'bsc.rw',   'enterprise', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name         = VALUES(name),
  email_domain = VALUES(email_domain),
  subdomain    = VALUES(subdomain);

-- ── BSC Rwanda: Top-level Departments ────────────────────────
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('dept-ceo',        'org-bsc-001', 'CEO Office',  NULL, 1, NOW()),
  ('dept-technical',  'org-bsc-001', 'Technical',   NULL, 1, NOW()),
  ('dept-commercial', 'org-bsc-001', 'Commercial',  NULL, 1, NOW()),
  ('dept-corporate',  'org-bsc-001', 'Corporate',   NULL, 1, NOW()),
  ('dept-finance',    'org-bsc-001', 'Finance',     NULL, 1, NOW()),
  ('dept-pmo',        'org-bsc-001', 'PMO',         NULL, 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ── BSC Rwanda: Sub-departments / Units ──────────────────────
-- CEO Office units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-ceo-legal',   'org-bsc-001', 'Legal',   'dept-ceo', 1, NOW()),
  ('unit-ceo-audit',   'org-bsc-001', 'Auditor', 'dept-ceo', 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Technical units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-tech-access',   'org-bsc-001', 'Access',            'dept-technical', 1, NOW()),
  ('unit-tech-tx',       'org-bsc-001', 'TX',                'dept-technical', 1, NOW()),
  ('unit-tech-planning', 'org-bsc-001', 'Planning Projects', 'dept-technical', 1, NOW()),
  ('unit-tech-cloud',    'org-bsc-001', 'Cloud',             'dept-technical', 1, NOW()),
  ('unit-tech-noc',      'org-bsc-001', 'Noc',               'dept-technical', 1, NOW()),
  ('unit-tech-ipcore',   'org-bsc-001', 'IP Core',           'dept-technical', 1, NOW()),
  ('unit-tech-security', 'org-bsc-001', 'Security',          'dept-technical', 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Commercial units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-com-sales',    'org-bsc-001', 'Sales',               'dept-commercial', 1, NOW()),
  ('unit-com-mktg',     'org-bsc-001', 'Marketing',           'dept-commercial', 1, NOW()),
  ('unit-com-bizexp',   'org-bsc-001', 'Business Expansion',  'dept-commercial', 1, NOW()),
  ('unit-com-proddev',  'org-bsc-001', 'Product Development', 'dept-commercial', 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Corporate units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-corp-supchain', 'org-bsc-001', 'Supply Chain', 'dept-corporate', 1, NOW()),
  ('unit-corp-adminhr',  'org-bsc-001', 'Admin & HR',   'dept-corporate', 1, NOW()),
  ('unit-corp-hr',       'org-bsc-001', 'HR',           'dept-corporate', 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Finance units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-fin-acct',     'org-bsc-001', 'Accounting', 'dept-finance', 1, NOW()),
  ('unit-fin-recovery', 'org-bsc-001', 'Recovery',   'dept-finance', 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- PMO units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-pmo-sales',       'org-bsc-001', 'Project Sales',      'dept-pmo', 1, NOW()),
  ('unit-pmo-compliance',  'org-bsc-001', 'Project Compliance', 'dept-pmo', 1, NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);
