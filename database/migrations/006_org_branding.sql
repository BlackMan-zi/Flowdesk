-- 006_org_branding.sql
-- Adds letterhead branding columns + classification label list to organizations.
-- Header/footer images are stored on disk under media/branding/{org_id}/ and
-- the absolute path is recorded here (matching the pdf_template_path pattern).

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS header_image_path     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS footer_image_path     VARCHAR(500),
    ADD COLUMN IF NOT EXISTS letterhead_accent     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS classification_labels JSON;
