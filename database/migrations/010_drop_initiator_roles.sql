-- 010_drop_initiator_roles.sql
-- Role-based gatekeeping on who can initiate a form was confusing and rarely
-- needed in practice — visibility is already controlled per-form via
-- FormDefinition.visibility ('all_users' | 'specific_departments') and the
-- system always knows the logged-in user's identity. Drop the junction table.

DROP TABLE IF EXISTS form_definition_initiator_roles;
