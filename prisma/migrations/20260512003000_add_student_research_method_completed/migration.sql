SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'research_method_completed'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE `students` ADD COLUMN `research_method_completed` BOOLEAN NOT NULL DEFAULT false AFTER `kkn_completed`',
  'SELECT 1'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
