-- ============================================================
-- FlowDesk Database Seed: Users
-- Version: 1.0
-- Generated: 2026-04-15
-- Description: BSC Rwanda staff accounts
-- NOTE: Passwords are hashed with bcrypt.
--       Demo password: FlowDesk@2024
--       Hash: $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaJobMR/tHvGmcf5TWVNQ7IiO
-- ============================================================

-- Helper: re-usable bcrypt hash for demo password FlowDesk@2024
SET @demo_hash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaJobMR/tHvGmcf5TWVNQ7IiO';

-- ── CEO Office ───────────────────────────────────────────────
INSERT INTO users (id, organization_id, name, email, password_hash, department_id, status, must_reset_password, created_at)
VALUES
  ('usr-ceo-001', 'org-bsc-001', 'Gilbert Kayinamura', 'gilbert.kayinamura@bsc.rw',  @demo_hash, 'dept-ceo',         'Active', 0, NOW()),
  ('usr-ceo-002', 'org-bsc-001', 'Christian Mbabazi',  'christian.mbabazi@bsc.rw',   @demo_hash, 'dept-ceo',         'Active', 0, NOW()),
  ('usr-ceo-003', 'org-bsc-001', 'Ndoli Mitali',       'ndoli.mitali@bsc.rw',        @demo_hash, 'dept-ceo',         'Active', 0, NOW()),
  ('usr-ceo-004', 'org-bsc-001', 'Susan Mutesi',       'susan.mutesi@bsc.rw',        @demo_hash, 'dept-ceo',         'Active', 0, NOW()),
  ('usr-ceo-005', 'org-bsc-001', 'Innocent Ruzindana', 'innocent.ruzindana@bsc.rw',  @demo_hash, 'dept-ceo',         'Active', 0, NOW()),
  ('usr-ceo-006', 'org-bsc-001', 'Dominique Muhire',   'dominique.muhire@bsc.rw',    @demo_hash, 'dept-ceo',         'Active', 0, NOW()),
  ('usr-ceo-007', 'org-bsc-001', 'Dennis Kaliisa',     'dennis.kaliisa@bsc.rw',      @demo_hash, 'unit-ceo-legal',   'Active', 0, NOW()),
  ('usr-ceo-008', 'org-bsc-001', 'Regis Nkwaya',       'regis.nkwaya@bsc.rw',        @demo_hash, 'unit-ceo-audit',   'Active', 0, NOW())
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- ── Technical Department (sample — Senior Managers & Managers) ─
INSERT INTO users (id, organization_id, name, email, password_hash, department_id, status, must_reset_password, created_at)
VALUES
  ('usr-tech-001', 'org-bsc-001', 'Philip Mudenge',      'philip.mudenge@bsc.rw',      @demo_hash, 'dept-technical',    'Active', 0, NOW()),
  ('usr-tech-002', 'org-bsc-001', 'Robert Nkeramugaba',  'robert.nkeramugaba@bsc.rw',  @demo_hash, 'dept-technical',    'Active', 0, NOW()),
  ('usr-tech-003', 'org-bsc-001', 'Yves Ishema',         'yves.ishema@bsc.rw',         @demo_hash, 'unit-tech-access',  'Active', 0, NOW()),
  ('usr-tech-004', 'org-bsc-001', 'Jean Claude Karemera','jeanclaude.karemera@bsc.rw', @demo_hash, 'unit-tech-tx',      'Active', 0, NOW()),
  ('usr-tech-005', 'org-bsc-001', 'Joan Mukantagara',    'joan.mukantagara@bsc.rw',    @demo_hash, 'unit-tech-planning','Active', 0, NOW()),
  ('usr-tech-006', 'org-bsc-001', 'Richard Buregeya',    'richard.buregeya@bsc.rw',    @demo_hash, 'unit-tech-cloud',   'Active', 0, NOW()),
  ('usr-tech-007', 'org-bsc-001', 'Callixte Mugabo',     'callixte.mugabo@bsc.rw',     @demo_hash, 'unit-tech-noc',     'Active', 0, NOW()),
  ('usr-tech-008', 'org-bsc-001', 'Ingrid Iradukunda',   'ingrid.iradukunda@bsc.rw',   @demo_hash, 'unit-tech-ipcore',  'Active', 0, NOW()),
  ('usr-tech-009', 'org-bsc-001', 'Yves Nkaka',          'yves.nkaka@bsc.rw',          @demo_hash, 'unit-tech-security','Active', 0, NOW())
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- ── Corporate Department ─────────────────────────────────────
INSERT INTO users (id, organization_id, name, email, password_hash, department_id, status, must_reset_password, created_at)
VALUES
  ('usr-corp-001', 'org-bsc-001', 'Justin Munyampeta',   'justin.munyampeta@bsc.rw',   @demo_hash, 'unit-corp-supchain', 'Active', 0, NOW()),
  ('usr-corp-002', 'org-bsc-001', 'Noella Uwamariya',    'noella.uwamariya@bsc.rw',    @demo_hash, 'unit-corp-adminhr',  'Active', 0, NOW()),
  ('usr-corp-003', 'org-bsc-001', 'Nadege Umutoniwase',  'nadege.umutoniwase@bsc.rw',  @demo_hash, 'unit-corp-hr',       'Active', 0, NOW()),
  ('usr-corp-004', 'org-bsc-001', 'William Manzi',       'william.manzi@bsc.rw',       @demo_hash, 'unit-corp-hr',       'Active', 0, NOW())
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- ── Finance Department ───────────────────────────────────────
INSERT INTO users (id, organization_id, name, email, password_hash, department_id, status, must_reset_password, created_at)
VALUES
  ('usr-fin-001', 'org-bsc-001', 'Felicien Batitonda',   'felicien.batitonda@bsc.rw',  @demo_hash, 'dept-finance',     'Active', 0, NOW()),
  ('usr-fin-002', 'org-bsc-001', 'Daniel Muyoboke',      'daniel.muyoboke@bsc.rw',     @demo_hash, 'unit-fin-acct',    'Active', 0, NOW()),
  ('usr-fin-003', 'org-bsc-001', 'Vianney Mugabo',       'vianney.mugabo@bsc.rw',      @demo_hash, 'unit-fin-recovery','Active', 0, NOW())
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- ── Hierarchy links ─────────────────────────────────────────
UPDATE users SET
  manager_id    = 'usr-ceo-001',
  hod_id        = 'usr-ceo-001'
WHERE id IN ('usr-ceo-007', 'usr-ceo-008');

UPDATE users SET
  manager_id    = 'usr-ceo-001',
  hod_id        = 'usr-ceo-005'
WHERE id IN ('usr-tech-001', 'usr-tech-002');

UPDATE users SET
  manager_id    = 'usr-tech-001',
  hod_id        = 'usr-ceo-005'
WHERE id IN ('usr-tech-003','usr-tech-004','usr-tech-005');

UPDATE users SET
  manager_id    = 'usr-tech-002',
  hod_id        = 'usr-ceo-005'
WHERE id IN ('usr-tech-006','usr-tech-007','usr-tech-008');

UPDATE users SET
  manager_id    = 'usr-ceo-004',
  hod_id        = 'usr-ceo-004'
WHERE id IN ('usr-corp-001','usr-corp-002','usr-corp-003');

UPDATE users SET
  manager_id    = 'usr-corp-003',
  hod_id        = 'usr-ceo-004'
WHERE id = 'usr-corp-004';

UPDATE users SET
  manager_id    = 'usr-ceo-002',
  hod_id        = 'usr-ceo-002'
WHERE id = 'usr-fin-001';

UPDATE users SET
  manager_id    = 'usr-fin-001',
  hod_id        = 'usr-ceo-002'
WHERE id IN ('usr-fin-002','usr-fin-003');
