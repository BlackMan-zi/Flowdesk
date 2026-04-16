-- ============================================================
-- FlowDesk Database Seed: Approval Templates
-- Version: 1.0
-- Generated: 2026-04-15
-- Description: Workflow approval chains for each form type
-- ============================================================
-- Role type enum values:
--   Hierarchy | Functional | Executive | SpecificUser | SelectedAtSubmission
-- Hierarchy levels: manager | sn_manager | hod
-- ============================================================

-- ── Approval Templates ────────────────────────────────────────
INSERT INTO approval_templates (
  id, organization_id, name, description,
  restart_on_correction, is_active, created_by, created_at, updated_at
) VALUES
  (
    'tmpl-leave',      'org-bsc-001',
    'Leave Request Workflow',
    'Manager → HR & Admin → HOD approval chain for leave requests',
    1, 1, 'usr-ceo-001', NOW(), NOW()
  ),
  (
    'tmpl-purchase',   'org-bsc-001',
    'Purchase Requisition Workflow',
    'Manager → SN Manager → Supply Chain → HOD → Finance approval chain',
    1, 1, 'usr-ceo-001', NOW(), NOW()
  ),
  (
    'tmpl-travel',     'org-bsc-001',
    'Travel Authorisation Workflow',
    'Manager → HOD → CFO approval chain for travel requests',
    1, 1, 'usr-ceo-001', NOW(), NOW()
  ),
  (
    'tmpl-expense',    'org-bsc-001',
    'Expense Claim Workflow',
    'Manager → HOD → Finance approval chain for expense reimbursements',
    1, 1, 'usr-ceo-001', NOW(), NOW()
  ),
  (
    'tmpl-overtime',   'org-bsc-001',
    'Overtime Authorisation Workflow',
    'Manager → HOD two-step approval for overtime requests',
    1, 1, 'usr-ceo-001', NOW(), NOW()
  ),
  (
    'tmpl-asset',      'org-bsc-001',
    'Asset Requisition Workflow',
    'Manager → Supply Chain → HOD approval chain for asset requests',
    1, 1, 'usr-ceo-001', NOW(), NOW()
  )
ON DUPLICATE KEY UPDATE description = VALUES(description);


-- ── Leave Request Steps ───────────────────────────────────────
-- Step 1: Line Manager (Hierarchy)
-- Step 2: HR & Admin (Functional)
-- Step 3: Head of Department (Hierarchy)
INSERT INTO approval_template_steps (
  id, template_id, step_order, step_label,
  role_type, role_id, hierarchy_level,
  skip_if_missing, delegation_allowed
) VALUES
  (
    'step-leave-01', 'tmpl-leave', 1, 'Line Manager Approval',
    'Hierarchy', NULL, 'manager',
    0, 1
  ),
  (
    'step-leave-02', 'tmpl-leave', 2, 'HR & Admin Review',
    'Functional', 'role-hr-admin', NULL,
    0, 1
  ),
  (
    'step-leave-03', 'tmpl-leave', 3, 'Head of Department Approval',
    'Hierarchy', NULL, 'hod',
    0, 1
  )
ON DUPLICATE KEY UPDATE step_label = VALUES(step_label);


-- ── Purchase Requisition Steps ────────────────────────────────
-- Step 1: Line Manager (Hierarchy)
-- Step 2: Senior Manager (Hierarchy)
-- Step 3: Supply Chain (Functional)
-- Step 4: Head of Department (Hierarchy)
-- Step 5: Finance (Functional)
INSERT INTO approval_template_steps (
  id, template_id, step_order, step_label,
  role_type, role_id, hierarchy_level,
  skip_if_missing, delegation_allowed
) VALUES
  (
    'step-proc-01', 'tmpl-purchase', 1, 'Line Manager Approval',
    'Hierarchy', NULL, 'manager',
    0, 1
  ),
  (
    'step-proc-02', 'tmpl-purchase', 2, 'Senior Manager Review',
    'Hierarchy', NULL, 'sn_manager',
    1, 1
  ),
  (
    'step-proc-03', 'tmpl-purchase', 3, 'Supply Chain Review',
    'Functional', 'role-supply-chain', NULL,
    0, 1
  ),
  (
    'step-proc-04', 'tmpl-purchase', 4, 'Head of Department Approval',
    'Hierarchy', NULL, 'hod',
    0, 1
  ),
  (
    'step-proc-05', 'tmpl-purchase', 5, 'Finance Approval',
    'Functional', 'role-finance', NULL,
    0, 1
  )
ON DUPLICATE KEY UPDATE step_label = VALUES(step_label);


-- ── Travel Authorisation Steps ────────────────────────────────
-- Step 1: Line Manager (Hierarchy)
-- Step 2: Head of Department (Hierarchy)
-- Step 3: CFO (Executive)
INSERT INTO approval_template_steps (
  id, template_id, step_order, step_label,
  role_type, role_id, hierarchy_level,
  skip_if_missing, delegation_allowed
) VALUES
  (
    'step-travel-01', 'tmpl-travel', 1, 'Line Manager Approval',
    'Hierarchy', NULL, 'manager',
    0, 1
  ),
  (
    'step-travel-02', 'tmpl-travel', 2, 'Head of Department Approval',
    'Hierarchy', NULL, 'hod',
    0, 1
  ),
  (
    'step-travel-03', 'tmpl-travel', 3, 'CFO Approval',
    'Executive', 'role-cfo', NULL,
    0, 1
  )
ON DUPLICATE KEY UPDATE step_label = VALUES(step_label);


-- ── Expense Claim Steps ───────────────────────────────────────
-- Step 1: Line Manager (Hierarchy)
-- Step 2: Head of Department (Hierarchy)
-- Step 3: Finance (Functional)
INSERT INTO approval_template_steps (
  id, template_id, step_order, step_label,
  role_type, role_id, hierarchy_level,
  skip_if_missing, delegation_allowed
) VALUES
  (
    'step-exp-01', 'tmpl-expense', 1, 'Line Manager Approval',
    'Hierarchy', NULL, 'manager',
    0, 1
  ),
  (
    'step-exp-02', 'tmpl-expense', 2, 'Head of Department Approval',
    'Hierarchy', NULL, 'hod',
    0, 1
  ),
  (
    'step-exp-03', 'tmpl-expense', 3, 'Finance Verification',
    'Functional', 'role-finance', NULL,
    0, 1
  )
ON DUPLICATE KEY UPDATE step_label = VALUES(step_label);


-- ── Overtime Authorisation Steps ──────────────────────────────
-- Step 1: Line Manager (Hierarchy)
-- Step 2: Head of Department (Hierarchy)
INSERT INTO approval_template_steps (
  id, template_id, step_order, step_label,
  role_type, role_id, hierarchy_level,
  skip_if_missing, delegation_allowed
) VALUES
  (
    'step-ot-01', 'tmpl-overtime', 1, 'Line Manager Approval',
    'Hierarchy', NULL, 'manager',
    0, 1
  ),
  (
    'step-ot-02', 'tmpl-overtime', 2, 'Head of Department Approval',
    'Hierarchy', NULL, 'hod',
    0, 1
  )
ON DUPLICATE KEY UPDATE step_label = VALUES(step_label);


-- ── Asset Requisition Steps ───────────────────────────────────
-- Step 1: Line Manager (Hierarchy)
-- Step 2: Supply Chain (Functional)
-- Step 3: Head of Department (Hierarchy)
INSERT INTO approval_template_steps (
  id, template_id, step_order, step_label,
  role_type, role_id, hierarchy_level,
  skip_if_missing, delegation_allowed
) VALUES
  (
    'step-asset-01', 'tmpl-asset', 1, 'Line Manager Approval',
    'Hierarchy', NULL, 'manager',
    0, 1
  ),
  (
    'step-asset-02', 'tmpl-asset', 2, 'Supply Chain Review',
    'Functional', 'role-supply-chain', NULL,
    0, 1
  ),
  (
    'step-asset-03', 'tmpl-asset', 3, 'Head of Department Approval',
    'Hierarchy', NULL, 'hod',
    0, 1
  )
ON DUPLICATE KEY UPDATE step_label = VALUES(step_label);


-- ── CC Recipients ─────────────────────────────────────────────
-- Leave: HR notified on completion
INSERT INTO approval_template_cc_recipients (
  id, template_id, role_type, role_id, hierarchy_level, label
) VALUES
  (UUID(), 'tmpl-leave',    'Functional', 'role-hr',      NULL,  'HR Record'),
  (UUID(), 'tmpl-purchase', 'Functional', 'role-finance',  NULL,  'Finance Records'),
  (UUID(), 'tmpl-expense',  'Functional', 'role-finance',  NULL,  'Finance Records'),
  (UUID(), 'tmpl-asset',    'Functional', 'role-supply-chain', NULL, 'Supply Chain Records')
ON DUPLICATE KEY UPDATE label = VALUES(label);


-- ── Link templates to form definitions ───────────────────────
UPDATE form_definitions SET approval_template_id = 'tmpl-leave'
WHERE id = 'form-def-leave';

UPDATE form_definitions SET approval_template_id = 'tmpl-purchase'
WHERE id = 'form-def-purchase';

UPDATE form_definitions SET approval_template_id = 'tmpl-travel'
WHERE id = 'form-def-travel';

UPDATE form_definitions SET approval_template_id = 'tmpl-expense'
WHERE id = 'form-def-expense';

UPDATE form_definitions SET approval_template_id = 'tmpl-overtime'
WHERE id = 'form-def-overtime';

UPDATE form_definitions SET approval_template_id = 'tmpl-asset'
WHERE id = 'form-def-asset';
