-- 012_section_layouts.sql
-- Per-section layout dictionary on FormDefinition.
--
-- form_definitions.section_layouts — JSON map of { section_name -> layout },
-- where layout is one of:
--   'grid'  : current 12-col grid, fields wrap by their grid_width (default)
--   'row'   : single horizontal row, fields squeeze to fit
--   'stack' : one field per row, full-width (ignoring grid_width)
--
-- Unspecified sections default to 'grid'. Missing column is treated as {}.

ALTER TABLE form_definitions
    ADD COLUMN IF NOT EXISTS section_layouts JSON DEFAULT '{}'::json;
