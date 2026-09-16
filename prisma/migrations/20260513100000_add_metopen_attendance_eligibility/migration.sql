-- Add Metopen attendance eligibility gate for TA-03A/TA-03B.
-- Students below the 75% Metopel attendance threshold are auto-finalized with score 0.

-- AlterTable
ALTER TABLE `research_method_scores`
  ADD COLUMN `attendance_record_id` VARCHAR(255) NULL,
  ADD COLUMN `attendance_auto_zeroed_at` DATETIME(3) NULL,
  ADD COLUMN `attendance_auto_zero_reason` TEXT NULL;

-- CreateTable
CREATE TABLE `metopen_attendance_imports` (
    `id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NULL,
    `document_id` VARCHAR(191) NULL,
    `uploaded_by_user_id` VARCHAR(191) NOT NULL,
    `class_code` VARCHAR(100) NULL,
    `course_name` VARCHAR(255) NULL,
    `semester_label` VARCHAR(100) NULL,
    `filter_label` VARCHAR(100) NULL,
    `lecturer_names` JSON NULL,
    `threshold_percent` DOUBLE NOT NULL DEFAULT 0.75,
    `total_rows` INTEGER NOT NULL DEFAULT 0,
    `matched_rows` INTEGER NOT NULL DEFAULT 0,
    `eligible_rows` INTEGER NOT NULL DEFAULT 0,
    `ineligible_rows` INTEGER NOT NULL DEFAULT 0,
    `auto_zeroed_count` INTEGER NOT NULL DEFAULT 0,
    `skipped_finalized_count` INTEGER NOT NULL DEFAULT 0,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `metopen_attendance_imports_academic_year_id_idx`(`academic_year_id`),
    INDEX `metopen_attendance_imports_document_id_idx`(`document_id`),
    INDEX `metopen_attendance_imports_uploaded_by_user_id_idx`(`uploaded_by_user_id`),
    INDEX `metopen_attendance_imports_uploaded_at_idx`(`uploaded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metopen_attendance_records` (
    `id` VARCHAR(255) NOT NULL,
    `import_id` VARCHAR(255) NOT NULL,
    `student_id` VARCHAR(191) NULL,
    `identity_number` VARCHAR(50) NOT NULL,
    `student_name` VARCHAR(255) NULL,
    `present_count` INTEGER NOT NULL DEFAULT 0,
    `absent_count` INTEGER NOT NULL DEFAULT 0,
    `sick_count` INTEGER NOT NULL DEFAULT 0,
    `permit_count` INTEGER NOT NULL DEFAULT 0,
    `total_meetings` INTEGER NOT NULL DEFAULT 0,
    `attendance_percentage` DOUBLE NOT NULL,
    `is_eligible` BOOLEAN NOT NULL,
    `raw_row` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `metopen_attendance_records_import_id_identity_number_key`(`import_id`, `identity_number`),
    INDEX `metopen_attendance_records_identity_number_idx`(`identity_number`),
    INDEX `metopen_attendance_records_student_id_idx`(`student_id`),
    INDEX `metopen_attendance_records_is_eligible_idx`(`is_eligible`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `research_method_scores_attendance_record_id_idx` ON `research_method_scores`(`attendance_record_id`);

-- AddForeignKey
ALTER TABLE `metopen_attendance_imports`
  ADD CONSTRAINT `metopen_attendance_imports_academic_year_id_fkey`
  FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_imports`
  ADD CONSTRAINT `metopen_attendance_imports_document_id_fkey`
  FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_imports`
  ADD CONSTRAINT `metopen_attendance_imports_uploaded_by_user_id_fkey`
  FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_records`
  ADD CONSTRAINT `metopen_attendance_records_import_id_fkey`
  FOREIGN KEY (`import_id`) REFERENCES `metopen_attendance_imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_records`
  ADD CONSTRAINT `metopen_attendance_records_student_id_fkey`
  FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores`
  ADD CONSTRAINT `research_method_scores_attendance_record_id_fkey`
  FOREIGN KEY (`attendance_record_id`) REFERENCES `metopen_attendance_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
