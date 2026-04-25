-- ============================================================
-- FlowDesk Database Init: PostgreSQL setup
-- Runs automatically on first container start (empty volume).
-- The POSTGRES_USER / POSTGRES_DB / POSTGRES_PASSWORD env vars
-- already create the user and database, so this script only
-- adds any extra extensions needed by the application.
-- ============================================================

-- Enable pgcrypto for UUID generation (optional, used by gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;
