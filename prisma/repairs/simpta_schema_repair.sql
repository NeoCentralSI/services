-- Idempotent SIMPTA production schema repair.
-- This file is intentionally separate from Prisma migrations because it repairs
-- partially migrated production databases before the app starts.

SET @participants_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_participants'
);
SET @legacy_supervisors_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_supervisors'
);
SET @ddl := IF(
  @participants_exists = 0 AND @legacy_supervisors_exists > 0,
  'RENAME TABLE `thesis_supervisors` TO `thesis_participants`',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `thesis_participants` (
  `id` VARCHAR(191) NOT NULL,
  `thesis_id` VARCHAR(191) NOT NULL,
  `lecturer_id` VARCHAR(191) NOT NULL,
  `role_id` VARCHAR(191) NOT NULL,
  `status` ENUM('active', 'terminated') NOT NULL DEFAULT 'active',
  `seminar_ready` TINYINT(1) NOT NULL DEFAULT 0,
  `defence_ready` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `thesis_participants_lecturer_id_fkey` (`lecturer_id`),
  KEY `thesis_participants_role_id_fkey` (`role_id`),
  KEY `thesis_participants_thesis_id_fkey` (`thesis_id`),
  KEY `thesis_participants_thesis_lecturer_status_idx` (`thesis_id`, `lecturer_id`, `status`),
  KEY `thesis_participants_thesis_role_status_idx` (`thesis_id`, `role_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_participants'
    AND column_name = 'seminar_ready'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_participants` ADD COLUMN `seminar_ready` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_participants'
    AND column_name = 'defence_ready'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_participants` ADD COLUMN `defence_ready` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'research_method_completed'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `research_method_completed` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'eligible_metopen'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `eligible_metopen` TINYINT(1) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'metopen_eligibility_source'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `metopen_eligibility_source` ENUM(''sia'', ''devtools'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'metopen_eligibility_updated_at'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `metopen_eligibility_updated_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'taking_thesis_course'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `taking_thesis_course` TINYINT(1) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'thesis_course_enrollment_source'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `thesis_course_enrollment_source` ENUM(''sia'', ''devtools'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'students'
    AND column_name = 'thesis_course_enrollment_updated_at'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `students` ADD COLUMN `thesis_course_enrollment_updated_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'problem_statement'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `problem_statement` LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'proposed_solution'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `proposed_solution` LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'research_object'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `research_object` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'research_permit_status'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `research_permit_status` ENUM(''approved'', ''in_process'', ''not_approved'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @enum_needs_repair := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'research_permit_status'
    AND column_type NOT LIKE '%''not_approved''%'
);
SET @ddl := IF(@enum_needs_repair > 0, 'ALTER TABLE `thesis_advisor_request` MODIFY COLUMN `research_permit_status` ENUM(''approved'', ''in_process'', ''not_approved'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'request_type'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `request_type` ENUM(''ta_01'', ''ta_02'') NOT NULL DEFAULT ''ta_01''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @enum_needs_repair := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'request_type'
    AND column_type NOT LIKE '%''ta_02''%'
);
SET @ddl := IF(@enum_needs_repair > 0, 'ALTER TABLE `thesis_advisor_request` MODIFY COLUMN `request_type` ENUM(''ta_01'', ''ta_02'') NOT NULL DEFAULT ''ta_01''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @enum_needs_repair := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'status'
    AND column_type NOT LIKE '%''revision_requested''%'
);
SET @ddl := IF(@enum_needs_repair > 0, 'ALTER TABLE `thesis_advisor_request` MODIFY COLUMN `status` ENUM(''pending'', ''under_review'', ''pending_kadep'', ''booking_approved'', ''active_official'', ''revision_requested'', ''rejected_by_dosen'', ''rejected_by_kadep'', ''canceled'', ''closed'', ''escalated'', ''approved'', ''rejected'', ''override_approved'', ''redirected'', ''withdrawn'', ''assigned'') NOT NULL DEFAULT ''pending''', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'lecturer_approval_note'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `lecturer_approval_note` LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'student_justification'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `student_justification` LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request'
    AND column_name = 'lecturer_overquota_reason'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request` ADD COLUMN `lecturer_overquota_reason` LONGTEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `thesis_advisor_request`
SET `request_type` = 'ta_02'
WHERE `lecturer_id` IS NULL
  AND `request_type` = 'ta_01';

UPDATE `thesis_advisor_request`
SET `student_justification` = `justification_text`
WHERE `student_justification` IS NULL
  AND `justification_text` IS NOT NULL;

UPDATE `thesis_advisor_request`
SET `lecturer_overquota_reason` = `lecturer_approval_note`
WHERE `lecturer_overquota_reason` IS NULL
  AND `lecturer_approval_note` IS NOT NULL;

CREATE TABLE IF NOT EXISTS `thesis_advisor_request_draft` (
  `id` VARCHAR(255) NOT NULL,
  `student_id` VARCHAR(199) NOT NULL,
  `lecturer_id` VARCHAR(255) NULL,
  `topic_id` VARCHAR(255) NULL,
  `proposed_title` VARCHAR(255) NULL,
  `background_summary` TEXT NULL,
  `problem_statement` TEXT NULL,
  `proposed_solution` TEXT NULL,
  `research_object` VARCHAR(255) NULL,
  `research_permit_status` ENUM('approved', 'in_process', 'not_approved') NULL,
  `justification_text` TEXT NULL,
  `student_justification` TEXT NULL,
  `attachment_id` VARCHAR(255) NULL,
  `last_submitted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_advisor_request_draft_student_id_key` (`student_id`),
  KEY `thesis_advisor_request_draft_lecturer_id_idx` (`lecturer_id`),
  KEY `thesis_advisor_request_draft_topic_id_idx` (`topic_id`),
  KEY `thesis_advisor_request_draft_attachment_id_idx` (`attachment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request_draft'
    AND column_name = 'problem_statement'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request_draft` ADD COLUMN `problem_statement` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request_draft'
    AND column_name = 'proposed_solution'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request_draft` ADD COLUMN `proposed_solution` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request_draft'
    AND column_name = 'research_object'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request_draft` ADD COLUMN `research_object` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request_draft'
    AND column_name = 'research_permit_status'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request_draft` ADD COLUMN `research_permit_status` ENUM(''approved'', ''in_process'', ''not_approved'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request_draft'
    AND column_name = 'student_justification'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis_advisor_request_draft` ADD COLUMN `student_justification` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @enum_needs_repair := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis_advisor_request_draft'
    AND column_name = 'research_permit_status'
    AND column_type NOT LIKE '%''not_approved''%'
);
SET @ddl := IF(@enum_needs_repair > 0, 'ALTER TABLE `thesis_advisor_request_draft` MODIFY COLUMN `research_permit_status` ENUM(''approved'', ''in_process'', ''not_approved'') NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `thesis_advisor_request_draft`
SET `student_justification` = `justification_text`
WHERE `student_justification` IS NULL
  AND `justification_text` IS NOT NULL;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'thesis'
    AND column_name = 'final_proposal_version_id'
);
SET @ddl := IF(@column_exists = 0, 'ALTER TABLE `thesis` ADD COLUMN `final_proposal_version_id` VARCHAR(255) NULL', 'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `thesis_proposal_versions` (
  `id` VARCHAR(255) NOT NULL,
  `thesis_id` VARCHAR(255) NOT NULL,
  `document_id` VARCHAR(255) NOT NULL,
  `version` INT NOT NULL,
  `description` TEXT NULL,
  `is_latest` TINYINT(1) NOT NULL DEFAULT 1,
  `submitted_as_final_at` DATETIME(3) NULL,
  `submitted_as_final_by_user_id` VARCHAR(255) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_proposal_versions_thesis_id_version_key` (`thesis_id`, `version`),
  KEY `thesis_proposal_versions_document_id_idx` (`document_id`),
  KEY `thesis_proposal_versions_thesis_id_is_latest_idx` (`thesis_id`, `is_latest`),
  KEY `thesis_proposal_versions_submitted_as_final_at_idx` (`submitted_as_final_at`),
  KEY `thesis_proposal_versions_submitted_as_final_by_user_id_idx` (`submitted_as_final_by_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
