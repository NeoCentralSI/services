-- Targeted harden: activeRoleKey + indexes (MySQL 8).
-- Run: npx prisma db execute --file scripts/apply-schema-harden-20260727.sql

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_supervisors'
    AND COLUMN_NAME = 'active_role_key'
);

SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE thesis_supervisors ADD COLUMN active_role_key VARCHAR(191) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE thesis_supervisors
SET active_role_key = CONCAT(thesis_id, ':', role_id)
WHERE status = 'active' AND active_role_key IS NULL;

UPDATE thesis_supervisors
SET active_role_key = NULL
WHERE status <> 'active' AND active_role_key IS NOT NULL;

SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_supervisors'
    AND INDEX_NAME = 'thesis_supervisors_active_role_key_key'
);

SET @sql := IF(
  @idx_exists = 0,
  'CREATE UNIQUE INDEX thesis_supervisors_active_role_key_key ON thesis_supervisors (active_role_key)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx2 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_supervisors'
    AND INDEX_NAME = 'thesis_supervisors_thesis_id_role_id_status_idx'
);

SET @sql := IF(
  @idx2 = 0,
  'CREATE INDEX thesis_supervisors_thesis_id_role_id_status_idx ON thesis_supervisors (thesis_id, role_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx3 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_advisor_request'
    AND INDEX_NAME = 'thesis_advisor_request_academic_year_id_status_idx'
);

SET @sql := IF(
  @idx3 = 0,
  'CREATE INDEX thesis_advisor_request_academic_year_id_status_idx ON thesis_advisor_request (academic_year_id, status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx4 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_advisor_request'
    AND INDEX_NAME = 'thesis_advisor_request_status_created_at_idx'
);

SET @sql := IF(
  @idx4 = 0,
  'CREATE INDEX thesis_advisor_request_status_created_at_idx ON thesis_advisor_request (status, created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx5 := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'research_method_scores'
    AND INDEX_NAME = 'research_method_scores_is_finalized_idx'
);

SET @sql := IF(
  @idx5 = 0,
  'CREATE INDEX research_method_scores_is_finalized_idx ON research_method_scores (is_finalized)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
