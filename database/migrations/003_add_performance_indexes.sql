-- Migration: Add performance indexes to critical lookup columns
-- This migration improves query performance for frequently accessed lookups

-- Index on organization email_domain (used in auth login)
CREATE INDEX IF NOT EXISTS ix_organization_email_domain 
ON organizations(email_domain);

-- Index on user email + organization_id (used in auth)
CREATE INDEX IF NOT EXISTS ix_user_email_org 
ON users(email, organization_id);

-- Index on user organization (used for data isolation)
CREATE INDEX IF NOT EXISTS ix_user_organization_id 
ON users(organization_id);

-- Index on approval instances by approver
CREATE INDEX IF NOT EXISTS ix_approval_approver_id 
ON approval_instances(approver_user_id);

-- Index on approval instances by status
CREATE INDEX IF NOT EXISTS ix_approval_status 
ON approval_instances(status);

-- Index on form instances by organization
CREATE INDEX IF NOT EXISTS ix_form_instance_org 
ON form_instances(organization_id);

-- Index on form instances by status
CREATE INDEX IF NOT EXISTS ix_form_instance_status 
ON form_instances(status);

-- Index on document shares by user
CREATE INDEX IF NOT EXISTS ix_document_share_user 
ON document_shares(user_id);

-- Index on generated documents by organization
CREATE INDEX IF NOT EXISTS ix_generated_document_org 
ON generated_documents(organization_id);

-- Index on user roles by user_id
CREATE INDEX IF NOT EXISTS ix_user_role_user_id 
ON user_roles(user_id);

-- Index on user roles by role_id
CREATE INDEX IF NOT EXISTS ix_user_role_role_id 
ON user_roles(role_id);
