-- ============================================================
-- FlowDesk Database Seed: Demo Form Instances
-- Version: 1.0
-- Generated: 2026-04-15
-- Description: Sample form submissions across all statuses for
--              demonstration and testing purposes
-- ============================================================
-- Statuses: Draft | Submitted | Pending | Returned for Correction
--           | Rejected | Approved | Completed
-- Version statuses: Draft | Active | Superseded
-- Approval step statuses: Waiting | Active | Approved | Rejected
--                         | Sent Back | Skipped
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SECTION 1 — COMPLETED FORMS
-- ─────────────────────────────────────────────────────────────

-- ── fi-leave-001 · Leave Request · Completed ──────────────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-leave-001', 'org-bsc-001', 'form-def-leave', 'BSC-LEAVE-2026-001',
  'usr-corp-004', 'Completed', 1,
  '2026-03-10 08:30:00', '2026-03-12 14:00:00',
  '2026-03-10 08:00:00', '2026-03-12 14:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-leave-001-v1', 'fi-leave-001', 1, 'usr-corp-004',
  'Active', '2026-03-10 08:00:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-leave-001-v1', 'ff-leave-01', 'Annual Leave'),
  (UUID(), 'fv-leave-001-v1', 'ff-leave-02', '2026-03-17'),
  (UUID(), 'fv-leave-001-v1', 'ff-leave-03', '2026-03-21'),
  (UUID(), 'fv-leave-001-v1', 'ff-leave-04', '5'),
  (UUID(), 'fv-leave-001-v1', 'ff-leave-05', 'Family engagement'),
  (UUID(), 'fv-leave-001-v1', 'ff-leave-06', 'Nadege Umutoniwase')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-leave-001-v1', 'step-leave-01',
   1, 'Line Manager Approval', 'usr-corp-003',
   'Approved', '2026-03-10 10:15:00', '2026-03-10 08:30:00', '2026-03-10 10:15:00'),
  (UUID(), 'org-bsc-001', 'fv-leave-001-v1', 'step-leave-02',
   2, 'HR & Admin Review', 'usr-corp-002',
   'Approved', '2026-03-11 09:00:00', '2026-03-10 10:15:00', '2026-03-11 09:00:00'),
  (UUID(), 'org-bsc-001', 'fv-leave-001-v1', 'step-leave-03',
   3, 'Head of Department Approval', 'usr-ceo-004',
   'Approved', '2026-03-12 14:00:00', '2026-03-11 09:00:00', '2026-03-12 14:00:00');


-- ── fi-leave-002 · Leave Request · Completed ──────────────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-leave-002', 'org-bsc-001', 'form-def-leave', 'BSC-LEAVE-2026-002',
  'usr-tech-003', 'Completed', 1,
  '2026-03-18 09:00:00', '2026-03-20 11:30:00',
  '2026-03-18 08:45:00', '2026-03-20 11:30:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-leave-002-v1', 'fi-leave-002', 1, 'usr-tech-003',
  'Active', '2026-03-18 08:45:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-leave-002-v1', 'ff-leave-01', 'Sick Leave'),
  (UUID(), 'fv-leave-002-v1', 'ff-leave-02', '2026-03-21'),
  (UUID(), 'fv-leave-002-v1', 'ff-leave-03', '2026-03-22'),
  (UUID(), 'fv-leave-002-v1', 'ff-leave-04', '2'),
  (UUID(), 'fv-leave-002-v1', 'ff-leave-05', 'Medical appointment')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-leave-002-v1', 'step-leave-01',
   1, 'Line Manager Approval', 'usr-tech-001',
   'Approved', '2026-03-18 11:00:00', '2026-03-18 09:00:00', '2026-03-18 11:00:00'),
  (UUID(), 'org-bsc-001', 'fv-leave-002-v1', 'step-leave-02',
   2, 'HR & Admin Review', 'usr-corp-002',
   'Approved', '2026-03-19 10:00:00', '2026-03-18 11:00:00', '2026-03-19 10:00:00'),
  (UUID(), 'org-bsc-001', 'fv-leave-002-v1', 'step-leave-03',
   3, 'Head of Department Approval', 'usr-ceo-005',
   'Approved', '2026-03-20 11:30:00', '2026-03-19 10:00:00', '2026-03-20 11:30:00');


-- ── fi-purchase-001 · Purchase Requisition · Completed ────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-purchase-001', 'org-bsc-001', 'form-def-purchase', 'BSC-PROC-2026-001',
  'usr-tech-006', 'Completed', 1,
  '2026-03-05 08:00:00', '2026-03-11 16:00:00',
  '2026-03-05 07:45:00', '2026-03-11 16:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-purchase-001-v1', 'fi-purchase-001', 1, 'usr-tech-006',
  'Active', '2026-03-05 07:45:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-01', 'Network Switch — Cisco Catalyst 9300 24-port PoE+'),
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-02', '2'),
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-03', '8500000'),
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-04', 'Syscom Rwanda'),
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-05', 'Replacement of end-of-life switching infrastructure in NOC'),
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-06', 'TECH-CAPEX-2026'),
  (UUID(), 'fv-purchase-001-v1', 'ff-proc-07', 'Budget verified — within Q1 CAPEX allocation. Approved.')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-purchase-001-v1', 'step-proc-01',
   1, 'Line Manager Approval', 'usr-tech-002',
   'Approved', '2026-03-05 10:00:00', '2026-03-05 08:00:00', '2026-03-05 10:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-001-v1', 'step-proc-02',
   2, 'Senior Manager Review', 'usr-tech-002',
   'Skipped', NULL, '2026-03-05 10:00:00', '2026-03-05 10:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-001-v1', 'step-proc-03',
   3, 'Supply Chain Review', 'usr-corp-001',
   'Approved', '2026-03-07 14:00:00', '2026-03-05 10:00:00', '2026-03-07 14:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-001-v1', 'step-proc-04',
   4, 'Head of Department Approval', 'usr-ceo-005',
   'Approved', '2026-03-10 09:30:00', '2026-03-07 14:00:00', '2026-03-10 09:30:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-001-v1', 'step-proc-05',
   5, 'Finance Approval', 'usr-fin-002',
   'Approved', '2026-03-11 16:00:00', '2026-03-10 09:30:00', '2026-03-11 16:00:00');


-- ── fi-expense-001 · Expense Claim · Completed ────────────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-expense-001', 'org-bsc-001', 'form-def-expense', 'BSC-EXP-2026-001',
  'usr-tech-004', 'Completed', 1,
  '2026-03-14 10:00:00', '2026-03-17 12:00:00',
  '2026-03-14 09:45:00', '2026-03-17 12:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-expense-001-v1', 'fi-expense-001', 1, 'usr-tech-004',
  'Active', '2026-03-14 09:45:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-expense-001-v1', 'ff-exp-01', '2026-03-12'),
  (UUID(), 'fv-expense-001-v1', 'ff-exp-02', 'Transportation'),
  (UUID(), 'fv-expense-001-v1', 'ff-exp-03', '45000'),
  (UUID(), 'fv-expense-001-v1', 'ff-exp-04', 'Taxi to client site visit — Kigali Industrial Park'),
  (UUID(), 'fv-expense-001-v1', 'ff-exp-06', 'FIN-OPEX-TRANS-001')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-expense-001-v1', 'step-exp-01',
   1, 'Line Manager Approval', 'usr-tech-001',
   'Approved', '2026-03-14 14:30:00', '2026-03-14 10:00:00', '2026-03-14 14:30:00'),
  (UUID(), 'org-bsc-001', 'fv-expense-001-v1', 'step-exp-02',
   2, 'Head of Department Approval', 'usr-ceo-005',
   'Approved', '2026-03-15 11:00:00', '2026-03-14 14:30:00', '2026-03-15 11:00:00'),
  (UUID(), 'org-bsc-001', 'fv-expense-001-v1', 'step-exp-03',
   3, 'Finance Verification', 'usr-fin-002',
   'Approved', '2026-03-17 12:00:00', '2026-03-15 11:00:00', '2026-03-17 12:00:00');


-- ─────────────────────────────────────────────────────────────
-- SECTION 2 — IN-PROGRESS / PENDING FORMS
-- ─────────────────────────────────────────────────────────────

-- ── fi-travel-001 · Travel Authorisation · Pending (step 2) ──
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-travel-001', 'org-bsc-001', 'form-def-travel', 'BSC-TRAVEL-2026-001',
  'usr-tech-005', 'Pending', 1,
  '2026-04-10 09:00:00', NULL,
  '2026-04-10 08:45:00', '2026-04-12 10:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-travel-001-v1', 'fi-travel-001', 1, 'usr-tech-005',
  'Active', '2026-04-10 08:45:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-travel-001-v1', 'ff-travel-01', 'Nairobi, Kenya'),
  (UUID(), 'fv-travel-001-v1', 'ff-travel-02', 'Attend Africa Telecom Summit 2026 and vendor meetings with Nokia'),
  (UUID(), 'fv-travel-001-v1', 'ff-travel-03', '2026-04-22'),
  (UUID(), 'fv-travel-001-v1', 'ff-travel-04', '2026-04-25'),
  (UUID(), 'fv-travel-001-v1', 'ff-travel-05', 'Flight'),
  (UUID(), 'fv-travel-001-v1', 'ff-travel-06', '120000'),
  (UUID(), 'fv-travel-001-v1', 'ff-travel-07', 'true')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-travel-001-v1', 'step-travel-01',
   1, 'Line Manager Approval', 'usr-tech-001',
   'Approved', '2026-04-11 10:00:00', '2026-04-10 09:00:00', '2026-04-11 10:00:00'),
  (UUID(), 'org-bsc-001', 'fv-travel-001-v1', 'step-travel-02',
   2, 'Head of Department Approval', 'usr-ceo-005',
   'Active', NULL, '2026-04-11 10:00:00', '2026-04-11 10:00:00'),
  (UUID(), 'org-bsc-001', 'fv-travel-001-v1', 'step-travel-03',
   3, 'CFO Approval', 'usr-ceo-002',
   'Waiting', NULL, '2026-04-11 10:00:00', '2026-04-11 10:00:00');


-- ── fi-purchase-002 · Purchase Requisition · Pending (step 1) ─
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-purchase-002', 'org-bsc-001', 'form-def-purchase', 'BSC-PROC-2026-002',
  'usr-tech-007', 'Pending', 1,
  '2026-04-14 11:00:00', NULL,
  '2026-04-14 10:30:00', '2026-04-14 11:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-purchase-002-v1', 'fi-purchase-002', 1, 'usr-tech-007',
  'Active', '2026-04-14 10:30:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-purchase-002-v1', 'ff-proc-01', 'Uninterruptible Power Supply (UPS) — APC Smart-UPS 3000VA'),
  (UUID(), 'fv-purchase-002-v1', 'ff-proc-02', '1'),
  (UUID(), 'fv-purchase-002-v1', 'ff-proc-03', '2200000'),
  (UUID(), 'fv-purchase-002-v1', 'ff-proc-04', 'PowerTech Rwanda'),
  (UUID(), 'fv-purchase-002-v1', 'ff-proc-05', 'NOC backup power for critical rack equipment'),
  (UUID(), 'fv-purchase-002-v1', 'ff-proc-06', 'TECH-CAPEX-2026')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-purchase-002-v1', 'step-proc-01',
   1, 'Line Manager Approval', 'usr-tech-002',
   'Active', NULL, '2026-04-14 11:00:00', '2026-04-14 11:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-002-v1', 'step-proc-02',
   2, 'Senior Manager Review', NULL,
   'Waiting', NULL, '2026-04-14 11:00:00', '2026-04-14 11:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-002-v1', 'step-proc-03',
   3, 'Supply Chain Review', 'usr-corp-001',
   'Waiting', NULL, '2026-04-14 11:00:00', '2026-04-14 11:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-002-v1', 'step-proc-04',
   4, 'Head of Department Approval', 'usr-ceo-005',
   'Waiting', NULL, '2026-04-14 11:00:00', '2026-04-14 11:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-002-v1', 'step-proc-05',
   5, 'Finance Approval', 'usr-fin-002',
   'Waiting', NULL, '2026-04-14 11:00:00', '2026-04-14 11:00:00');


-- ── fi-overtime-001 · Overtime Authorisation · Pending ────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-overtime-001', 'org-bsc-001', 'form-def-overtime', 'BSC-OT-2026-001',
  'usr-tech-008', 'Pending', 1,
  '2026-04-13 15:00:00', NULL,
  '2026-04-13 14:50:00', '2026-04-14 09:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-overtime-001-v1', 'fi-overtime-001', 1, 'usr-tech-008',
  'Active', '2026-04-13 14:50:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-overtime-001-v1', 'step-ot-01',
   1, 'Line Manager Approval', 'usr-tech-002',
   'Approved', '2026-04-14 09:00:00', '2026-04-13 15:00:00', '2026-04-14 09:00:00'),
  (UUID(), 'org-bsc-001', 'fv-overtime-001-v1', 'step-ot-02',
   2, 'Head of Department Approval', 'usr-ceo-005',
   'Active', NULL, '2026-04-14 09:00:00', '2026-04-14 09:00:00');


-- ─────────────────────────────────────────────────────────────
-- SECTION 3 — RETURNED FOR CORRECTION
-- ─────────────────────────────────────────────────────────────

-- ── fi-expense-002 · Expense Claim · Returned for Correction ──
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-expense-002', 'org-bsc-001', 'form-def-expense', 'BSC-EXP-2026-002',
  'usr-tech-009', 'Returned for Correction', 2,
  '2026-04-08 09:30:00', NULL,
  '2026-04-08 09:00:00', '2026-04-11 10:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, change_notes, created_at
) VALUES
  (
    'fv-expense-002-v1', 'fi-expense-002', 1, 'usr-tech-009',
    'Superseded', 'Initial submission',
    '2026-04-08 09:00:00'
  ),
  (
    'fv-expense-002-v2', 'fi-expense-002', 2, 'usr-tech-009',
    'Draft', 'Resubmission — corrected amount and added receipt reference',
    '2026-04-11 10:00:00'
  )
ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-expense-002-v2', 'ff-exp-01', '2026-04-05'),
  (UUID(), 'fv-expense-002-v2', 'ff-exp-02', 'Meals & Entertainment'),
  (UUID(), 'fv-expense-002-v2', 'ff-exp-03', '75000'),
  (UUID(), 'fv-expense-002-v2', 'ff-exp-04', 'Team lunch following successful network migration project completion'),
  (UUID(), 'fv-expense-002-v2', 'ff-exp-06', 'FIN-OPEX-ENT-001')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, notes, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-expense-002-v1', 'step-exp-01',
   1, 'Line Manager Approval', 'usr-tech-002',
   'Sent Back',
   'Please attach the receipt and confirm the GL code before resubmitting.',
   '2026-04-10 09:00:00', '2026-04-08 09:30:00', '2026-04-10 09:00:00');


-- ─────────────────────────────────────────────────────────────
-- SECTION 4 — REJECTED FORMS
-- ─────────────────────────────────────────────────────────────

-- ── fi-purchase-003 · Purchase Requisition · Rejected ─────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-purchase-003', 'org-bsc-001', 'form-def-purchase', 'BSC-PROC-2026-003',
  'usr-ceo-007', 'Rejected', 1,
  '2026-03-25 10:00:00', '2026-03-27 15:00:00',
  '2026-03-25 09:45:00', '2026-03-27 15:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-purchase-003-v1', 'fi-purchase-003', 1, 'usr-ceo-007',
  'Active', '2026-03-25 09:45:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-purchase-003-v1', 'ff-proc-01', 'Standing desks — ergonomic sit/stand — 5 units'),
  (UUID(), 'fv-purchase-003-v1', 'ff-proc-02', '5'),
  (UUID(), 'fv-purchase-003-v1', 'ff-proc-03', '3500000'),
  (UUID(), 'fv-purchase-003-v1', 'ff-proc-04', 'Office Furniture Direct'),
  (UUID(), 'fv-purchase-003-v1', 'ff-proc-05', 'Improve ergonomics for Legal team to reduce back pain complaints')
ON DUPLICATE KEY UPDATE value = VALUES(value);

INSERT INTO approval_instances (
  id, organization_id, form_version_id, template_step_id,
  step_order, step_label, approver_user_id,
  status, notes, signed_at, created_at, updated_at
) VALUES
  (UUID(), 'org-bsc-001', 'fv-purchase-003-v1', 'step-proc-01',
   1, 'Line Manager Approval', 'usr-ceo-001',
   'Approved', NULL, '2026-03-25 14:00:00', '2026-03-25 10:00:00', '2026-03-25 14:00:00'),
  (UUID(), 'org-bsc-001', 'fv-purchase-003-v1', 'step-proc-03',
   3, 'Supply Chain Review', 'usr-corp-001',
   'Rejected',
   'Non-essential CAPEX — deferred to Q3 budget review. Insufficient budget allocation in Q1.',
   '2026-03-27 15:00:00', '2026-03-25 14:00:00', '2026-03-27 15:00:00');


-- ─────────────────────────────────────────────────────────────
-- SECTION 5 — DRAFT FORMS
-- ─────────────────────────────────────────────────────────────

-- ── fi-leave-003 · Leave Request · Draft ──────────────────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-leave-003', 'org-bsc-001', 'form-def-leave', 'BSC-LEAVE-2026-003',
  'usr-fin-003', 'Draft', 1,
  NULL, NULL,
  '2026-04-15 07:30:00', '2026-04-15 07:30:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-leave-003-v1', 'fi-leave-003', 1, 'usr-fin-003',
  'Draft', '2026-04-15 07:30:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);

INSERT INTO form_field_values (id, form_version_id, form_field_id, value) VALUES
  (UUID(), 'fv-leave-003-v1', 'ff-leave-01', 'Annual Leave'),
  (UUID(), 'fv-leave-003-v1', 'ff-leave-02', '2026-05-01'),
  (UUID(), 'fv-leave-003-v1', 'ff-leave-03', '2026-05-07')
ON DUPLICATE KEY UPDATE value = VALUES(value);


-- ── fi-asset-001 · Asset Requisition · Draft ──────────────────
INSERT INTO form_instances (
  id, organization_id, form_definition_id, reference_number,
  created_by, current_status, current_version,
  submitted_at, completed_at, created_at, updated_at
) VALUES (
  'fi-asset-001', 'org-bsc-001', 'form-def-asset', 'BSC-ASSET-2026-001',
  'usr-corp-004', 'Draft', 1,
  NULL, NULL,
  '2026-04-15 08:00:00', '2026-04-15 08:00:00'
) ON DUPLICATE KEY UPDATE current_status = VALUES(current_status);

INSERT INTO form_versions (
  id, form_instance_id, version_number, created_by,
  status, created_at
) VALUES (
  'fv-asset-001-v1', 'fi-asset-001', 1, 'usr-corp-004',
  'Draft', '2026-04-15 08:00:00'
) ON DUPLICATE KEY UPDATE status = VALUES(status);


-- ─────────────────────────────────────────────────────────────
-- SECTION 6 — AUDIT LOGS
-- ─────────────────────────────────────────────────────────────

INSERT INTO audit_logs (
  id, organization_id, user_id, action,
  entity_type, entity_id, details, ip_address, timestamp
) VALUES
  -- Leave 001 lifecycle
  (UUID(), 'org-bsc-001', 'usr-corp-004', 'FORM_CREATED',
   'FormInstance', 'fi-leave-001',
   '{"form_def": "Leave Request Form", "reference": "BSC-LEAVE-2026-001"}',
   '10.0.1.25', '2026-03-10 08:00:00'),
  (UUID(), 'org-bsc-001', 'usr-corp-004', 'FORM_SUBMITTED',
   'FormInstance', 'fi-leave-001',
   '{"reference": "BSC-LEAVE-2026-001"}',
   '10.0.1.25', '2026-03-10 08:30:00'),
  (UUID(), 'org-bsc-001', 'usr-corp-003', 'STEP_APPROVED',
   'FormInstance', 'fi-leave-001',
   '{"step": 1, "step_label": "Line Manager Approval", "reference": "BSC-LEAVE-2026-001"}',
   '10.0.1.12', '2026-03-10 10:15:00'),
  (UUID(), 'org-bsc-001', 'usr-corp-002', 'STEP_APPROVED',
   'FormInstance', 'fi-leave-001',
   '{"step": 2, "step_label": "HR & Admin Review", "reference": "BSC-LEAVE-2026-001"}',
   '10.0.1.18', '2026-03-11 09:00:00'),
  (UUID(), 'org-bsc-001', 'usr-ceo-004', 'STEP_APPROVED',
   'FormInstance', 'fi-leave-001',
   '{"step": 3, "step_label": "Head of Department Approval", "reference": "BSC-LEAVE-2026-001"}',
   '10.0.0.5', '2026-03-12 14:00:00'),
  (UUID(), 'org-bsc-001', 'usr-ceo-004', 'FORM_COMPLETED',
   'FormInstance', 'fi-leave-001',
   '{"reference": "BSC-LEAVE-2026-001"}',
   '10.0.0.5', '2026-03-12 14:00:00'),

  -- Purchase 001 — rejection at step 3
  (UUID(), 'org-bsc-001', 'usr-ceo-007', 'FORM_CREATED',
   'FormInstance', 'fi-purchase-003',
   '{"form_def": "Purchase Requisition", "reference": "BSC-PROC-2026-003"}',
   '10.0.0.8', '2026-03-25 09:45:00'),
  (UUID(), 'org-bsc-001', 'usr-ceo-007', 'FORM_SUBMITTED',
   'FormInstance', 'fi-purchase-003',
   '{"reference": "BSC-PROC-2026-003"}',
   '10.0.0.8', '2026-03-25 10:00:00'),
  (UUID(), 'org-bsc-001', 'usr-corp-001', 'STEP_REJECTED',
   'FormInstance', 'fi-purchase-003',
   '{"step": 3, "step_label": "Supply Chain Review", "reference": "BSC-PROC-2026-003", "reason": "Non-essential CAPEX deferred to Q3"}',
   '10.0.1.30', '2026-03-27 15:00:00'),

  -- Expense 002 — returned for correction
  (UUID(), 'org-bsc-001', 'usr-tech-009', 'FORM_SUBMITTED',
   'FormInstance', 'fi-expense-002',
   '{"reference": "BSC-EXP-2026-002"}',
   '10.0.1.22', '2026-04-08 09:30:00'),
  (UUID(), 'org-bsc-001', 'usr-tech-002', 'STEP_SENT_BACK',
   'FormInstance', 'fi-expense-002',
   '{"step": 1, "step_label": "Line Manager Approval", "reference": "BSC-EXP-2026-002"}',
   '10.0.1.20', '2026-04-10 09:00:00'),

  -- User login events (sample)
  (UUID(), 'org-bsc-001', 'usr-ceo-001', 'USER_LOGIN',
   'User', 'usr-ceo-001',
   '{"method": "password"}',
   '10.0.0.1', '2026-04-15 07:55:00'),
  (UUID(), 'org-bsc-001', 'usr-corp-004', 'USER_LOGIN',
   'User', 'usr-corp-004',
   '{"method": "password"}',
   '10.0.1.25', '2026-04-15 08:00:00');
