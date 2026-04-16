-- ============================================================
-- FlowDesk Database Init: Create dedicated application user
-- Runs automatically on first Docker MySQL start.
-- ============================================================

-- Create app user (accessible from any host inside Docker network)
CREATE USER IF NOT EXISTS 'flowdesk_app'@'%' IDENTIFIED BY 'FlowDesk_App@2024';

-- Grant full privileges on the flowdesk database only
GRANT ALL PRIVILEGES ON flowdesk.* TO 'flowdesk_app'@'%';

FLUSH PRIVILEGES;
