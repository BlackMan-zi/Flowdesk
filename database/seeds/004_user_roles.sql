-- ============================================================
-- FlowDesk Database Seed: User Role Assignments
-- Version: 1.0
-- Generated: 2026-04-15
-- Description: Maps users to their functional roles
-- ============================================================

-- ── System Admin ─────────────────────────────────────────────
INSERT INTO user_roles (id, user_id, role_id) VALUES
  (UUID(), 'usr-ceo-001', 'role-admin'),
  (UUID(), 'usr-ceo-001', 'role-hod'),
  (UUID(), 'usr-ceo-001', 'role-ceo')
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- ── Chiefs (HOD level) ───────────────────────────────────────
INSERT INTO user_roles (id, user_id, role_id) VALUES
  (UUID(), 'usr-ceo-002', 'role-hod'),   -- Christian Mbabazi (CFO)
  (UUID(), 'usr-ceo-002', 'role-cfo'),
  (UUID(), 'usr-ceo-003', 'role-hod'),   -- Ndoli Mitali (CCO)
  (UUID(), 'usr-ceo-004', 'role-hod'),   -- Susan Mutesi (Chief Corporate)
  (UUID(), 'usr-ceo-004', 'role-chief-corp'),
  (UUID(), 'usr-ceo-005', 'role-hod'),   -- Innocent Ruzindana (CTO)
  (UUID(), 'usr-ceo-006', 'role-hod')    -- Dominique Muhire (Dir PMO)
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- ── Senior Managers ──────────────────────────────────────────
INSERT INTO user_roles (id, user_id, role_id) VALUES
  (UUID(), 'usr-tech-001', 'role-sn-manager'),
  (UUID(), 'usr-tech-002', 'role-sn-manager'),
  (UUID(), 'usr-fin-001',  'role-sn-manager'),
  (UUID(), 'usr-fin-001',  'role-finance')
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- ── Managers ─────────────────────────────────────────────────
INSERT INTO user_roles (id, user_id, role_id) VALUES
  (UUID(), 'usr-ceo-007', 'role-manager'),
  (UUID(), 'usr-ceo-008', 'role-manager'),
  (UUID(), 'usr-tech-003', 'role-manager'),
  (UUID(), 'usr-tech-004', 'role-manager'),
  (UUID(), 'usr-tech-005', 'role-manager'),
  (UUID(), 'usr-tech-006', 'role-manager'),
  (UUID(), 'usr-tech-007', 'role-manager'),
  (UUID(), 'usr-tech-008', 'role-manager'),
  (UUID(), 'usr-tech-009', 'role-manager'),
  (UUID(), 'usr-corp-001', 'role-manager'),
  (UUID(), 'usr-corp-001', 'role-supply-chain'),
  (UUID(), 'usr-corp-002', 'role-manager'),
  (UUID(), 'usr-corp-002', 'role-hr-admin'),
  (UUID(), 'usr-corp-003', 'role-manager'),
  (UUID(), 'usr-corp-003', 'role-hr'),
  (UUID(), 'usr-fin-002',  'role-manager'),
  (UUID(), 'usr-fin-002',  'role-finance'),
  (UUID(), 'usr-fin-003',  'role-manager'),
  (UUID(), 'usr-fin-003',  'role-finance')
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);

-- ── Standard Users ───────────────────────────────────────────
INSERT INTO user_roles (id, user_id, role_id) VALUES
  (UUID(), 'usr-corp-004', 'role-standard'),
  (UUID(), 'usr-corp-004', 'role-hr')
ON DUPLICATE KEY UPDATE role_id = VALUES(role_id);
