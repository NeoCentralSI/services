RENAME TABLE `thesis_supervisors` TO `thesis_participants`;

SET @schema_name := DATABASE();

SET @milestone_class_fk := (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'thesis_milestones'
    AND COLUMN_NAME = 'metopen_class_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);

SET @drop_milestone_class_fk_sql := IF(
  @milestone_class_fk IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE `thesis_milestones` DROP FOREIGN KEY `', @milestone_class_fk, '`')
);

PREPARE stmt_drop_milestone_class_fk FROM @drop_milestone_class_fk_sql;
EXECUTE stmt_drop_milestone_class_fk;
DEALLOCATE PREPARE stmt_drop_milestone_class_fk;

ALTER TABLE `thesis_milestone_templates`
  DROP COLUMN `is_gate_to_advisor_search`;

ALTER TABLE `thesis_milestones`
  DROP COLUMN `metopen_class_id`;

DROP TABLE IF EXISTS `metopen_class_students`;
DROP TABLE IF EXISTS `metopen_classes`;
