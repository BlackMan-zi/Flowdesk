-- 008_form_printed_title.sql
-- The printed_title is what shows on the rendered/printed form. It's optional:
-- when null, the form's `name` is used at render time. Useful when the admin
-- wants the internal label to differ from the official document heading
-- (e.g. name="Leave 2026 v2", printed_title="Annual Leave Request Form").

ALTER TABLE form_definitions
    ADD COLUMN IF NOT EXISTS printed_title VARCHAR(255);
