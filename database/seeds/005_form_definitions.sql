-- ============================================================
-- FlowDesk Database Seed: Form Definitions & Fields
-- Version: 1.0
-- Generated: 2026-04-15
-- Description: Core form templates used across the organisation
-- ============================================================

-- ── Form Definitions ─────────────────────────────────────────
INSERT INTO form_definitions (
  id, organization_id, name, code_suffix, description,
  visibility, is_active, requires_backdating, created_by, created_at
) VALUES
  (
    'form-def-leave', 'org-bsc-001',
    'Leave Request Form', 'LEAVE',
    'Employee leave request — annual, sick, or other leave types',
    'all_users', 1, 0,
    'usr-ceo-001', NOW()
  ),
  (
    'form-def-purchase', 'org-bsc-001',
    'Purchase Requisition', 'PROC',
    'Request for procurement of goods or services',
    'all_users', 1, 0,
    'usr-ceo-001', NOW()
  ),
  (
    'form-def-travel', 'org-bsc-001',
    'Travel Authorisation', 'TRAVEL',
    'Request for official travel — local or international',
    'all_users', 1, 0,
    'usr-ceo-001', NOW()
  ),
  (
    'form-def-expense', 'org-bsc-001',
    'Expense Claim', 'EXP',
    'Reimbursement request for out-of-pocket business expenses',
    'all_users', 1, 1,
    'usr-ceo-001', NOW()
  ),
  (
    'form-def-overtime', 'org-bsc-001',
    'Overtime Authorisation', 'OT',
    'Request for pre-approved overtime work',
    'all_users', 1, 0,
    'usr-ceo-001', NOW()
  ),
  (
    'form-def-asset', 'org-bsc-001',
    'Asset Requisition', 'ASSET',
    'Request for allocation of company assets (equipment, vehicles, etc.)',
    'all_users', 1, 0,
    'usr-ceo-001', NOW()
  )
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- ── Leave Request Fields ─────────────────────────────────────
INSERT INTO form_fields (
  id, form_definition_id, field_name, field_label, field_type,
  is_required, field_order, field_responsibility, created_at
) VALUES
  ('ff-leave-01', 'form-def-leave', 'leave_type',   'Leave Type',      'dropdown',  1, 1, 'initiator', NOW()),
  ('ff-leave-02', 'form-def-leave', 'date_from',    'Start Date',      'date',      1, 2, 'initiator', NOW()),
  ('ff-leave-03', 'form-def-leave', 'date_to',      'End Date',        'date',      1, 3, 'initiator', NOW()),
  ('ff-leave-04', 'form-def-leave', 'days_count',   'Number of Days',  'calculated',0, 4, 'initiator', NOW()),
  ('ff-leave-05', 'form-def-leave', 'reason',       'Reason',          'textarea',  0, 5, 'initiator', NOW()),
  ('ff-leave-06', 'form-def-leave', 'cover_person', 'Cover Person',    'text',      0, 6, 'initiator', NOW())
ON DUPLICATE KEY UPDATE field_label = VALUES(field_label);

-- ── Purchase Requisition Fields ──────────────────────────────
INSERT INTO form_fields (
  id, form_definition_id, field_name, field_label, field_type,
  is_required, field_order, field_responsibility, created_at
) VALUES
  ('ff-proc-01', 'form-def-purchase', 'description',      'Item Description',    'textarea',  1, 1, 'initiator', NOW()),
  ('ff-proc-02', 'form-def-purchase', 'quantity',         'Quantity',            'number',    1, 2, 'initiator', NOW()),
  ('ff-proc-03', 'form-def-purchase', 'estimated_cost',   'Estimated Cost (RWF)','currency',  1, 3, 'initiator', NOW()),
  ('ff-proc-04', 'form-def-purchase', 'supplier',         'Preferred Supplier',  'text',      0, 4, 'initiator', NOW()),
  ('ff-proc-05', 'form-def-purchase', 'justification',    'Business Justification','textarea', 1, 5, 'initiator', NOW()),
  ('ff-proc-06', 'form-def-purchase', 'budget_code',      'Budget Code',         'text',      0, 6, 'initiator', NOW()),
  ('ff-proc-07', 'form-def-purchase', 'finance_approval', 'Finance Comment',     'textarea',  0, 7, 'any',       NOW())
ON DUPLICATE KEY UPDATE field_label = VALUES(field_label);

-- ── Travel Authorisation Fields ──────────────────────────────
INSERT INTO form_fields (
  id, form_definition_id, field_name, field_label, field_type,
  is_required, field_order, field_responsibility, created_at
) VALUES
  ('ff-travel-01', 'form-def-travel', 'destination',   'Destination',          'text',     1, 1, 'initiator', NOW()),
  ('ff-travel-02', 'form-def-travel', 'purpose',       'Purpose of Travel',    'textarea', 1, 2, 'initiator', NOW()),
  ('ff-travel-03', 'form-def-travel', 'departure',     'Departure Date',       'date',     1, 3, 'initiator', NOW()),
  ('ff-travel-04', 'form-def-travel', 'return_date',   'Return Date',          'date',     1, 4, 'initiator', NOW()),
  ('ff-travel-05', 'form-def-travel', 'transport_mode','Mode of Transport',    'dropdown', 1, 5, 'initiator', NOW()),
  ('ff-travel-06', 'form-def-travel', 'per_diem',      'Per Diem (RWF/day)',   'currency', 0, 6, 'initiator', NOW()),
  ('ff-travel-07', 'form-def-travel', 'accommodation', 'Accommodation Needed', 'checkbox', 0, 7, 'initiator', NOW())
ON DUPLICATE KEY UPDATE field_label = VALUES(field_label);

-- ── Expense Claim Fields ─────────────────────────────────────
INSERT INTO form_fields (
  id, form_definition_id, field_name, field_label, field_type,
  is_required, field_order, field_responsibility, created_at
) VALUES
  ('ff-exp-01', 'form-def-expense', 'expense_date',   'Expense Date',         'date',     1, 1, 'initiator', NOW()),
  ('ff-exp-02', 'form-def-expense', 'category',       'Category',             'dropdown', 1, 2, 'initiator', NOW()),
  ('ff-exp-03', 'form-def-expense', 'amount',         'Amount (RWF)',         'currency', 1, 3, 'initiator', NOW()),
  ('ff-exp-04', 'form-def-expense', 'description',    'Description',          'textarea', 1, 4, 'initiator', NOW()),
  ('ff-exp-05', 'form-def-expense', 'receipt',        'Receipt Attachment',   'file',     0, 5, 'initiator', NOW()),
  ('ff-exp-06', 'form-def-expense', 'finance_code',   'Finance GL Code',      'text',     0, 6, 'any',       NOW())
ON DUPLICATE KEY UPDATE field_label = VALUES(field_label);
