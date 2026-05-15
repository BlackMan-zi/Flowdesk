-- 007_form_classification.sql
-- Adds per-form document classification (references one of the org's
-- classification labels by name). Color is resolved from the org's
-- classification_labels JSON at render time, so no FK is needed.

ALTER TABLE form_definitions
    ADD COLUMN IF NOT EXISTS confidentiality VARCHAR(100);
