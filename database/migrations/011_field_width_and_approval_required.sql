-- 011_field_width_and_approval_required.sql
-- Phase C.2 of the schema-designer redesign.
--
-- form_fields.grid_width — width fraction in the new 12-col canvas:
--   '1/4' | '1/3' | '1/2' | '2/3' | '3/4' | 'full'
-- form_fields.free_position — when true, x_pct/y_pct/width_pct/height_pct
--   override the grid (Round A free-positioning, off by default).
-- approval_template_steps.is_required — required steps (default) vs optional
--   ones the requester can choose to skip / approvers can mark not-applicable.

ALTER TABLE form_fields
    ADD COLUMN IF NOT EXISTS grid_width    VARCHAR(10) DEFAULT 'full';
ALTER TABLE form_fields
    ADD COLUMN IF NOT EXISTS free_position BOOLEAN     DEFAULT FALSE;

-- Backfill: wide types stay full, everything else picks 1/2 so existing forms
-- get the new compact two-up layout for free.
UPDATE form_fields
SET grid_width = '1/2'
WHERE grid_width IS NULL
  AND field_type NOT IN ('textarea', 'table', 'signature', 'file', 'calculated');

UPDATE form_fields
SET grid_width = 'full'
WHERE grid_width IS NULL;

ALTER TABLE approval_template_steps
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT TRUE;
