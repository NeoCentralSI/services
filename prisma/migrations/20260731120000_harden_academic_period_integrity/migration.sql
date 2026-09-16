-- Academic-period integrity hardening.
--
-- IMPORTANT: run `pnpm run academic-years:repair -- --apply` before this
-- migration when legacy duplicate/null/overlapping periods exist. The ALTERs
-- below intentionally fail closed if ambiguous legacy rows remain.

-- Backfill attendance imports from the unique/deterministically preferred
-- period covering their upload instant. Rows outside every configured window
-- remain NULL so the NOT NULL migration fails instead of guessing.
UPDATE `metopen_attendance_imports` AS `attendance_import`
SET `attendance_import`.`academic_year_id` = (
  SELECT `candidate`.`id`
  FROM `academic_years` AS `candidate`
  WHERE `candidate`.`start_date` IS NOT NULL
    AND `candidate`.`end_date` IS NOT NULL
    AND `attendance_import`.`uploaded_at`
      BETWEEN `candidate`.`start_date` AND `candidate`.`end_date`
  ORDER BY
    `candidate`.`is_active` DESC,
    `candidate`.`start_date` DESC,
    `candidate`.`created_at` ASC
  LIMIT 1
)
WHERE `attendance_import`.`academic_year_id` IS NULL;

ALTER TABLE `academic_years`
  ADD COLUMN `active_key` VARCHAR(16) NULL;

-- Preserve the single active row. The repair script rejects unresolved
-- multi-active data before this migration is applied.
UPDATE `academic_years`
SET `active_key` = CASE WHEN `is_active` = TRUE THEN 'ACTIVE' ELSE NULL END;

ALTER TABLE `academic_years`
  MODIFY `year` VARCHAR(20) NOT NULL,
  MODIFY `start_date` DATETIME(3) NOT NULL,
  MODIFY `end_date` DATETIME(3) NOT NULL,
  ADD CONSTRAINT `academic_years_date_order_chk`
    CHECK (`start_date` <= `end_date`);

CREATE UNIQUE INDEX `academic_years_year_semester_key`
  ON `academic_years`(`year`, `semester`);
CREATE UNIQUE INDEX `academic_years_active_key_key`
  ON `academic_years`(`active_key`);
CREATE INDEX `academic_years_start_date_end_date_idx`
  ON `academic_years`(`start_date`, `end_date`);

ALTER TABLE `metopen_attendance_imports`
  DROP FOREIGN KEY `metopen_attendance_imports_academic_year_id_fkey`;
ALTER TABLE `metopen_attendance_imports`
  MODIFY `academic_year_id` VARCHAR(191) NOT NULL;
ALTER TABLE `metopen_attendance_imports`
  ADD CONSTRAINT `metopen_attendance_imports_academic_year_id_fkey`
    FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `student_academic_year_snapshots` (
  `id` VARCHAR(191) NOT NULL,
  `student_id` VARCHAR(191) NOT NULL,
  `academic_year_id` VARCHAR(191) NOT NULL,
  `taking_thesis_course` BOOLEAN NOT NULL,
  `source` ENUM('sia', 'devtools') NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `student_ay_snapshots_student_period_key`
    (`student_id`, `academic_year_id`),
  INDEX `student_ay_snapshots_period_course_idx`
    (`academic_year_id`, `taking_thesis_course`),
  INDEX `student_ay_snapshots_captured_at_idx` (`captured_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_academic_year_snapshots`
  ADD CONSTRAINT `student_ay_snapshots_student_id_fkey`
    FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `student_academic_year_snapshots`
  ADD CONSTRAINT `student_ay_snapshots_period_id_fkey`
    FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
