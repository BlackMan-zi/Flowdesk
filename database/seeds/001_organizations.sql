-- ============================================================
-- FlowDesk Database Seed: Organizations & Departments
-- Version: 2.0 (PostgreSQL)
-- Description: Core organisational structure for BSC Rwanda
-- Note: single-tenant per deployment — tenant resolved by email_domain.
-- ============================================================

-- ── Organizations ────────────────────────────────────────────
INSERT INTO organizations (id, name, email_domain, subscription_plan, created_at, updated_at)
VALUES
  ('org-bsc-001', 'BSC Rwanda', 'bsc.rw', 'enterprise', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email_domain = EXCLUDED.email_domain;

-- ── Top-level Departments ────────────────────────────────────
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('dept-ceo',        'org-bsc-001', 'CEO Office',  NULL, true, NOW()),
  ('dept-technical',  'org-bsc-001', 'Technical',   NULL, true, NOW()),
  ('dept-commercial', 'org-bsc-001', 'Commercial',  NULL, true, NOW()),
  ('dept-corporate',  'org-bsc-001', 'Corporate',   NULL, true, NOW()),
  ('dept-finance',    'org-bsc-001', 'Finance',     NULL, true, NOW()),
  ('dept-pmo',        'org-bsc-001', 'PMO',         NULL, true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ── Sub-departments / Units ───────────────────────────────────
-- CEO Office units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-ceo-legal',   'org-bsc-001', 'Legal',   'dept-ceo', true, NOW()),
  ('unit-ceo-audit',   'org-bsc-001', 'Auditor', 'dept-ceo', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Technical units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-tech-access',   'org-bsc-001', 'Access',            'dept-technical', true, NOW()),
  ('unit-tech-tx',       'org-bsc-001', 'TX',                'dept-technical', true, NOW()),
  ('unit-tech-planning', 'org-bsc-001', 'Planning Projects', 'dept-technical', true, NOW()),
  ('unit-tech-cloud',    'org-bsc-001', 'Cloud',             'dept-technical', true, NOW()),
  ('unit-tech-noc',      'org-bsc-001', 'Noc',               'dept-technical', true, NOW()),
  ('unit-tech-ipcore',   'org-bsc-001', 'IP Core',           'dept-technical', true, NOW()),
  ('unit-tech-security', 'org-bsc-001', 'Security',          'dept-technical', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Commercial units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-com-sales',    'org-bsc-001', 'Sales',               'dept-commercial', true, NOW()),
  ('unit-com-mktg',     'org-bsc-001', 'Marketing',           'dept-commercial', true, NOW()),
  ('unit-com-bizexp',   'org-bsc-001', 'Business Expansion',  'dept-commercial', true, NOW()),
  ('unit-com-proddev',  'org-bsc-001', 'Product Development', 'dept-commercial', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Corporate units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-corp-supchain', 'org-bsc-001', 'Supply Chain', 'dept-corporate', true, NOW()),
  ('unit-corp-adminhr',  'org-bsc-001', 'Admin & HR',   'dept-corporate', true, NOW()),
  ('unit-corp-hr',       'org-bsc-001', 'HR',           'dept-corporate', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Finance units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-fin-acct',     'org-bsc-001', 'Accounting', 'dept-finance', true, NOW()),
  ('unit-fin-recovery', 'org-bsc-001', 'Recovery',   'dept-finance', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- PMO units
INSERT INTO departments (id, organization_id, name, parent_department_id, is_active, created_at)
VALUES
  ('unit-pmo-sales',       'org-bsc-001', 'Project Sales',      'dept-pmo', true, NOW()),
  ('unit-pmo-compliance',  'org-bsc-001', 'Project Compliance', 'dept-pmo', true, NOW())
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
