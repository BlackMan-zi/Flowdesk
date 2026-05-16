-- 014_initiator_signature.sql
-- Initiator's signature + signed-date captured at submit time.
-- Decoupled from the approval-step signatures because the initiator isn't
-- in the approval chain proper; this is the "I, the requester, certify
-- this form" mark plus a date the initiator chose (so a form that
-- represents a backdated event can be dated to when the event actually
-- happened, not when it was typed in).
--
--   form_instances.initiator_signature_data — same encoding as
--     SignaturePad's value: "type:<name>" or "data:image/png;base64,...".
--   form_instances.initiator_signed_at — the date the initiator chose;
--     defaults to submitted_at on the frontend but admin can override.
--
-- Portable across Postgres (>=13) and MySQL (>=8.0.29).

ALTER TABLE form_instances
    ADD COLUMN IF NOT EXISTS initiator_signature_data TEXT;
ALTER TABLE form_instances
    ADD COLUMN IF NOT EXISTS initiator_signed_at TIMESTAMP;
