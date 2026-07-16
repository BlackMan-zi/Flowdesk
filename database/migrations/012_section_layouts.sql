-- 012_section_layouts.sql
-- Per-section layout dictionary on FormDefinition.
--
-- form_definitions.section_layouts: JSON map of { section_name -> layout },
-- where layout is one of:
--   'grid'  : current 12-col grid, fields wrap by their grid_width (default)
--   'row'   : single horizontal row, fields squeeze to fit
--   'stack' : one field per row, full-width (ignoring grid_width)
--
-- Existing rows get NULL, which the application treats as {} (every section
-- defaults to 'grid'). New rows get {} via the SQLAlchemy column default.
--
-- Syntax is intentionally portable across Postgres (>=13) and MySQL
-- (>=8.0.29). No DEFAULT clause because MySQL doesn't allow a literal JSON
-- default and Postgres-cast syntax (::json) is non-portable.

ALTER TABLE form_definitions
    ADD COLUMN IF NOT EXISTS section_layouts JSON;
