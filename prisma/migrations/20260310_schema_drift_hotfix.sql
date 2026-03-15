-- Hotfix schema drift for local/dev databases that are not managed by Prisma Migrate.
-- Adds columns required by current Prisma schema used by calendar and advisor request flows.

ALTER TABLE thesis_guidances
  ADD COLUMN IF NOT EXISTS document_id VARCHAR(255) NULL;

ALTER TABLE thesis_advisor_request
  ADD COLUMN IF NOT EXISTS withdraw_count INT NOT NULL DEFAULT 0;
