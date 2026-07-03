-- ============================================================
-- FlowDesk Database Seed: Roles
-- Version: 1.0
-- Generated: 2026-04-15
-- Description: All system roles for BSC Rwanda organisation
-- ============================================================

INSERT INTO roles (id, organization_id, name, role_category, description, is_active, created_at)
VALUES
  -- System roles
  ('role-admin',        'org-bsc-001', 'Admin',          'System',    'System Administrator — full access',       true, NOW()),
  ('role-standard',     'org-bsc-001', 'Standard User',  'System',    'Regular employee — submit forms',          true, NOW()),
  ('role-observer',     'org-bsc-001', 'Observer',       'System',    'Read-only document access',                true, NOW()),
  ('role-report-mgr',   'org-bsc-001', 'Report Manager', 'Functional','Manages department reports and users',     true, NOW()),

  -- Hierarchy roles
  ('role-manager',      'org-bsc-001', 'Manager',        'Hierarchy', 'Unit/Team Manager — first approval step',  true, NOW()),
  ('role-sn-manager',   'org-bsc-001', 'SN Manager',     'Hierarchy', 'Senior Manager — second approval step',   true, NOW()),
  ('role-hod',          'org-bsc-001', 'HOD',            'Hierarchy', 'Head of Department — senior approval',    true, NOW()),

  -- Functional roles
  ('role-hr',           'org-bsc-001', 'HR',             'Functional','Human Resources approver',                 true, NOW()),
  ('role-hr-admin',     'org-bsc-001', 'HR & Admin',     'Functional','HR & Admin approver',                      true, NOW()),
  ('role-finance',      'org-bsc-001', 'Finance',        'Functional','Finance department approver',              true, NOW()),
  ('role-supply-chain', 'org-bsc-001', 'Supply Chain',   'Functional','Supply Chain approver',                    true, NOW()),
  ('role-it',           'org-bsc-001', 'IT',             'Functional','IT department approver',                   true, NOW()),

  -- Executive roles
  ('role-cfo',          'org-bsc-001', 'CFO',            'Executive', 'Chief Financial Officer',                  true, NOW()),
  ('role-ceo',          'org-bsc-001', 'CEO',            'Executive', 'Chief Executive Officer',                  true, NOW()),
  ('role-chief-corp',   'org-bsc-001', 'Chief Corporate','Executive', 'Chief Corporate Officer',                  true, NOW())
ON CONFLICT (id) DO UPDATE SET description = EXCLUDED.description;
