-- 013_form_version_schema_snapshot.sql
-- Snapshot of the form definition at the moment of submission, so pending /
-- approved forms keep rendering against the schema they were submitted with
-- even if an admin later edits the form definition (renames a field, removes
-- a section, changes layout etc.).
--
-- form_versions.schema_snapshot — JSON: { name, printed_title, code_suffix,
-- confidentiality, section_layouts, fields: [...] }. NULL on rows from before
-- this migration / draft versions; the application falls back to the live
-- form definition in that case.
--
-- Syntax portable across Postgres (>=13) and MySQL (>=8.0.29).

ALTER TABLE form_versions
    ADD COLUMN IF NOT EXISTS schema_snapshot JSON;
