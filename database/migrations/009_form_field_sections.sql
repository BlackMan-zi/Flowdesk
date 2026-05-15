-- 009_form_field_sections.sql
-- Adds named sections to form fields so the new schema-based designer can
-- group fields visually (e.g. "Employee Information", "Items", "Signatures").
-- Existing fields default to a single "General" section.

ALTER TABLE form_fields
    ADD COLUMN IF NOT EXISTS section_name VARCHAR(150);

UPDATE form_fields
SET    section_name = 'General'
WHERE  section_name IS NULL;
