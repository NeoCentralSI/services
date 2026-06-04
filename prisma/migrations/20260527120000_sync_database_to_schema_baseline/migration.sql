-- Sync current local database shape to services/prisma/schema.prisma without resetting data.
-- The DB was previously migration-status clean but still drifted from the Prisma datamodel.
-- Required columns are introduced nullable first, then backfilled, then tightened to NOT NULL.

SET @active_academic_year_id := (
  SELECT `id`
  FROM `academic_years`
  WHERE `is_active` = 1
  ORDER BY `created_at` DESC
  LIMIT 1
);
SET @fallback_academic_year_id := COALESCE(
  @active_academic_year_id,
  (SELECT `id` FROM `academic_years` ORDER BY `created_at` DESC LIMIT 1)
);
SET @fallback_company_id := (
  SELECT `id`
  FROM `companies`
  ORDER BY `created_at` DESC
  LIMIT 1
);

-- DropForeignKey
ALTER TABLE `internship_application_letters` DROP FOREIGN KEY `internship_application_letters_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_application_letters` DROP FOREIGN KEY `internship_application_letters_proposal_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_application_letters` DROP FOREIGN KEY `internship_application_letters_signed_as_role_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_application_letters` DROP FOREIGN KEY `internship_application_letters_signed_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assessments` DROP FOREIGN KEY `internship_assessments_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assessments` DROP FOREIGN KEY `internship_assessments_internship_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assessments` DROP FOREIGN KEY `internship_assessments_scored_by_lecturer_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assignment_letters` DROP FOREIGN KEY `internship_assignment_letters_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assignment_letters` DROP FOREIGN KEY `internship_assignment_letters_proposal_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assignment_letters` DROP FOREIGN KEY `internship_assignment_letters_response_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assignment_letters` DROP FOREIGN KEY `internship_assignment_letters_signed_as_role_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_assignment_letters` DROP FOREIGN KEY `internship_assignment_letters_signed_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_company_responses` DROP FOREIGN KEY `internship_company_responses_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_company_responses` DROP FOREIGN KEY `internship_company_responses_proposal_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_cpmk_scores` DROP FOREIGN KEY `internship_cpmk_scores_assessment_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_cpmk_scores` DROP FOREIGN KEY `internship_cpmk_scores_chosen_rubric_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_cpmk_scores` DROP FOREIGN KEY `internship_cpmk_scores_cpmk_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_final_score_summary` DROP FOREIGN KEY `internship_final_score_summary_internship_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_proposal_members` DROP FOREIGN KEY `internship_proposal_members_proposal_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_proposal_members` DROP FOREIGN KEY `internship_proposal_members_student_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_proposals` DROP FOREIGN KEY `internship_proposals_target_company_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_supervisor_letters` DROP FOREIGN KEY `internship_supervisor_letters_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_supervisor_letters` DROP FOREIGN KEY `internship_supervisor_letters_signed_as_role_id_fkey`;

-- DropForeignKey
ALTER TABLE `internship_supervisor_letters` DROP FOREIGN KEY `internship_supervisor_letters_signed_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `internships` DROP FOREIGN KEY `internships_assignment_letter_id_fkey`;

-- DropForeignKey
ALTER TABLE `internships` DROP FOREIGN KEY `internships_report_file_id_fkey`;

-- DropForeignKey
ALTER TABLE `internships` DROP FOREIGN KEY `internships_supervisor_letter_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_participants` DROP FOREIGN KEY `thesis_participants_thesis_id_fkey`;

-- DropIndex
DROP INDEX `internship_supervisor_letters_document_id_fkey` ON `internship_supervisor_letters`;

-- DropIndex
DROP INDEX `internship_supervisor_letters_signed_as_role_id_fkey` ON `internship_supervisor_letters`;

-- DropIndex
DROP INDEX `internship_supervisor_letters_signed_by_id_fkey` ON `internship_supervisor_letters`;

-- DropIndex
DROP INDEX `internships_assignment_letter_id_fkey` ON `internships`;

-- DropIndex
DROP INDEX `internships_report_file_id_fkey` ON `internships`;

-- DropIndex
DROP INDEX `internships_supervisor_letter_id_fkey` ON `internships`;

-- DropIndex
DROP INDEX `thesis_participants_one_active_lecturer_per_thesis_key` ON `thesis_participants`;

-- DropIndex
DROP INDEX `thesis_participants_one_active_role_per_thesis_key` ON `thesis_participants`;

-- AlterTable
ALTER TABLE `companies` ADD COLUMN `alasan` TEXT NULL,
    MODIFY `status` ENUM('save', 'blacklist', 'diajukan') NOT NULL DEFAULT 'save';

-- AlterTable
ALTER TABLE `exit_survey_questions` ADD COLUMN `exitSurveySessionId` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `internship_cpmks`
    ADD COLUMN `academic_year_id` VARCHAR(191) NULL,
    MODIFY `assessor_type` VARCHAR(20) NOT NULL;

UPDATE `internship_cpmks`
SET `academic_year_id` = @fallback_academic_year_id
WHERE `academic_year_id` IS NULL
  AND @fallback_academic_year_id IS NOT NULL;

ALTER TABLE `internship_cpmks`
    MODIFY `academic_year_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `internship_guidance_lecturer_criteria`
    ADD COLUMN `academic_year_id` VARCHAR(191) NULL,
    ADD COLUMN `week_number` INTEGER NULL,
    MODIFY `order_index` INTEGER NOT NULL DEFAULT 0;

UPDATE `internship_guidance_lecturer_criteria`
SET `academic_year_id` = @fallback_academic_year_id
WHERE `academic_year_id` IS NULL
  AND @fallback_academic_year_id IS NOT NULL;

UPDATE `internship_guidance_lecturer_criteria`
SET `week_number` = 1
WHERE `week_number` IS NULL;

ALTER TABLE `internship_guidance_lecturer_criteria`
    MODIFY `academic_year_id` VARCHAR(191) NOT NULL,
    MODIFY `week_number` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `internship_guidance_questions`
    ADD COLUMN `academic_year_id` VARCHAR(191) NULL,
    MODIFY `order_index` INTEGER NOT NULL DEFAULT 0;

UPDATE `internship_guidance_questions`
SET `academic_year_id` = @fallback_academic_year_id
WHERE `academic_year_id` IS NULL
  AND @fallback_academic_year_id IS NOT NULL;

ALTER TABLE `internship_guidance_questions`
    MODIFY `academic_year_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `internship_proposals`
    ADD COLUMN `app_letter_date_issued` DATE NULL,
    ADD COLUMN `app_letter_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `app_letter_doc_number` VARCHAR(191) NULL,
    ADD COLUMN `app_letter_signed_as_role_id` VARCHAR(191) NULL,
    ADD COLUMN `app_letter_signed_by_id` VARCHAR(191) NULL,
    ADD COLUMN `assign_letter_date_issued` DATE NULL,
    ADD COLUMN `assign_letter_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `assign_letter_doc_number` VARCHAR(191) NULL,
    ADD COLUMN `assign_letter_signed_as_role_id` VARCHAR(191) NULL,
    ADD COLUMN `assign_letter_signed_by_id` VARCHAR(191) NULL,
    ADD COLUMN `company_response_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `company_response_notes` TEXT NULL,
    ADD COLUMN `end_date_actual` DATE NULL,
    ADD COLUMN `end_date_planned` DATE NULL,
    ADD COLUMN `proposal_sekdep_notes` TEXT NULL,
    ADD COLUMN `proposed_end_date` DATE NULL,
    ADD COLUMN `proposed_start_date` DATE NULL,
    ADD COLUMN `start_date_actual` DATE NULL,
    ADD COLUMN `start_date_planned` DATE NULL;

UPDATE `internship_proposals`
SET `proposal_sekdep_notes` = `sekdep_notes`
WHERE `proposal_sekdep_notes` IS NULL;

UPDATE `internship_proposals`
SET `proposed_start_date` = DATE(`created_at`)
WHERE `proposed_start_date` IS NULL;

UPDATE `internship_proposals`
SET `proposed_end_date` = DATE(`created_at`)
WHERE `proposed_end_date` IS NULL;

UPDATE `internship_proposals`
SET `target_company_id` = @fallback_company_id
WHERE `target_company_id` IS NULL
  AND @fallback_company_id IS NOT NULL;

ALTER TABLE `internship_proposals`
    DROP COLUMN `sekdep_notes`,
    MODIFY `proposed_end_date` DATE NOT NULL,
    MODIFY `proposed_start_date` DATE NOT NULL,
    MODIFY `target_company_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `internship_supervisor_letters` ADD COLUMN `supervisor_id` VARCHAR(191) NULL,
    MODIFY `document_id` VARCHAR(191) NULL,
    MODIFY `signed_by_id` VARCHAR(191) NULL,
    MODIFY `signed_as_role_id` VARCHAR(191) NULL,
    ALTER COLUMN `updated_at` DROP DEFAULT;

UPDATE `internship_supervisor_letters` AS `letter`
INNER JOIN `lecturers` AS `lecturer`
  ON `lecturer`.`user_id` = `letter`.`signed_by_id`
SET `letter`.`supervisor_id` = `lecturer`.`user_id`
WHERE `letter`.`supervisor_id` IS NULL;

ALTER TABLE `internship_supervisor_letters`
    MODIFY `supervisor_id` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `internships` DROP COLUMN `assignment_letter_id`,
    DROP COLUMN `report_file_id`,
    DROP COLUMN `supervisor_letter_id`,
    ADD COLUMN `company_receipt_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `company_receipt_notes` TEXT NULL,
    ADD COLUMN `company_receipt_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    ADD COLUMN `company_report_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `company_report_notes` TEXT NULL,
    ADD COLUMN `company_report_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    ADD COLUMN `completion_certificate_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `completion_certificate_notes` TEXT NULL,
    ADD COLUMN `completion_certificate_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    ADD COLUMN `field_assessment_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `field_assessment_signature_hash` VARCHAR(255) NULL,
    ADD COLUMN `field_assessment_status` ENUM('PENDING', 'APPROVED', 'COMPLETED') NULL,
    ADD COLUMN `field_assessment_submitted_at` DATETIME(3) NULL,
    ADD COLUMN `field_supervisor_email` VARCHAR(191) NULL,
    ADD COLUMN `final_grade` VARCHAR(10) NULL,
    ADD COLUMN `final_numeric_score` DOUBLE NULL,
    ADD COLUMN `is_logbook_locked` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `lecturer_assessment_status` ENUM('PENDING', 'APPROVED', 'COMPLETED') NULL,
    ADD COLUMN `logbook_document_id` VARCHAR(191) NULL,
    ADD COLUMN `logbook_document_notes` TEXT NULL,
    ADD COLUMN `logbook_document_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    ADD COLUMN `logbook_field_signature_hash` VARCHAR(255) NULL,
    ADD COLUMN `logbook_field_signed_at` DATETIME(3) NULL,
    ADD COLUMN `logbook_locked_at` DATETIME(3) NULL,
    ADD COLUMN `report_document_id` VARCHAR(191) NULL,
    ADD COLUMN `report_feedback_document_id` VARCHAR(191) NULL,
    ADD COLUMN `report_final_doc_id` VARCHAR(191) NULL,
    ADD COLUMN `report_final_notes` TEXT NULL,
    ADD COLUMN `report_final_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    ADD COLUMN `report_final_title` VARCHAR(191) NULL,
    ADD COLUMN `report_final_uploaded_at` DATETIME(3) NULL,
    ADD COLUMN `report_notes` TEXT NULL,
    ADD COLUMN `report_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    ADD COLUMN `sup_letter_id` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY', 'ONGOING', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `lecturer_availabilities` DROP COLUMN `is_active`;

-- AlterTable
ALTER TABLE `thesis_advisor_request` MODIFY `status` ENUM('pending', 'under_review', 'pending_kadep', 'booking_approved', 'active_official', 'revision_requested', 'rejected_by_dosen', 'rejected_by_kadep', 'redirected', 'withdrawn', 'canceled', 'closed', 'escalated', 'approved', 'rejected', 'override_approved', 'assigned') NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE `thesis_defence_examiners` ADD COLUMN `unavailable_reasons` TEXT NULL;

-- AlterTable
ALTER TABLE `thesis_defences` DROP COLUMN `grade`,
    ADD COLUMN `supervisor_assessment_submitted_at` DATETIME(3) NULL,
    ADD COLUMN `unavailable_reasons` TEXT NULL;

-- AlterTable
ALTER TABLE `thesis_participants` DROP COLUMN `active_lecturer_key`,
    DROP COLUMN `active_role_key`;

-- AlterTable
ALTER TABLE `thesis_seminar_examiners` ADD COLUMN `unavailable_reasons` TEXT NULL;

-- AlterTable
ALTER TABLE `thesis_seminars` DROP COLUMN `grade`;

-- AlterTable
ALTER TABLE `yudisium_cpl_reccomendations` ADD COLUMN `recommendation_document_id` VARCHAR(255) NULL,
    ADD COLUMN `settlement_document_id` VARCHAR(255) NULL;

-- AlterTable
ALTER TABLE `yudisium_participants` ADD COLUMN `cpl_verified_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `yudisiums` ADD COLUMN `decree_uploaded_at` DATETIME(3) NULL;

-- DropTable
DROP TABLE `internship_application_letters`;

-- DropTable
DROP TABLE `internship_assessments`;

-- DropTable
DROP TABLE `internship_assignment_letters`;

-- DropTable
DROP TABLE `internship_company_responses`;

-- DropTable
DROP TABLE `internship_cpmk_scores`;

-- DropTable
DROP TABLE `internship_final_score_summary`;

-- DropTable
DROP TABLE `internship_proposal_members`;

-- CreateTable
CREATE TABLE `exit_survey_sessions` (
    `id` VARCHAR(255) NOT NULL,
    `exit_survey_form_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exit_survey_sessions_exit_survey_form_id_fkey`(`exit_survey_form_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_proposal` (
    `id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `status` ENUM('submitted', 'accepted', 'rejected') NOT NULL DEFAULT 'submitted',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_proposal_document_id_idx`(`document_id`),
    INDEX `thesis_proposal_student_id_idx`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_proposal_grades` (
    `id` VARCHAR(191) NOT NULL,
    `proposal_id` VARCHAR(191) NULL,
    `grade` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_proposal_grades_proposal_id_fkey`(`proposal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `research_method_grades` (
    `id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NULL,
    `grade` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `research_method_grades_student_id_fkey`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_lecturer_criteria_options` (
    `id` VARCHAR(191) NOT NULL,
    `criteria_id` VARCHAR(191) NOT NULL,
    `option_text` VARCHAR(191) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_lecturer_scores` (
    `internship_id` VARCHAR(191) NOT NULL,
    `chosen_rubric_id` VARCHAR(191) NOT NULL,
    `score` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_lecturer_scores_internship_id_fkey`(`internship_id`),
    INDEX `internship_lecturer_scores_chosen_rubric_id_fkey`(`chosen_rubric_id`),
    PRIMARY KEY (`internship_id`, `chosen_rubric_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_field_scores` (
    `internship_id` VARCHAR(191) NOT NULL,
    `chosen_rubric_id` VARCHAR(191) NOT NULL,
    `score` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_field_scores_internship_id_fkey`(`internship_id`),
    INDEX `internship_field_scores_chosen_rubric_id_fkey`(`chosen_rubric_id`),
    PRIMARY KEY (`internship_id`, `chosen_rubric_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `field_assessment_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `pin` VARCHAR(6) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `is_used` BOOLEAN NOT NULL DEFAULT false,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `field_assessment_tokens_token_key`(`token`),
    INDEX `field_assessment_tokens_internship_id_fkey`(`internship_id`),
    INDEX `field_assessment_tokens_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_holidays` (
    `id` VARCHAR(191) NOT NULL,
    `holiday_date` DATE NOT NULL,
    `name` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `internship_holidays_holiday_date_key`(`holiday_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `internship_proposals_app_letter_doc_number_key` ON `internship_proposals`(`app_letter_doc_number`);

-- CreateIndex
CREATE UNIQUE INDEX `internship_proposals_assign_letter_doc_number_key` ON `internship_proposals`(`assign_letter_doc_number`);

-- CreateIndex
CREATE INDEX `internships_sup_letter_id_fkey` ON `internships`(`sup_letter_id`);

-- CreateIndex
CREATE INDEX `internships_field_assessment_doc_id_fkey` ON `internships`(`field_assessment_doc_id`);

-- CreateIndex
CREATE INDEX `internships_completion_certificate_doc_id_fkey` ON `internships`(`completion_certificate_doc_id`);

-- CreateIndex
CREATE INDEX `internships_company_receipt_doc_id_fkey` ON `internships`(`company_receipt_doc_id`);

-- CreateIndex
CREATE INDEX `internships_report_document_id_fkey` ON `internships`(`report_document_id`);

-- CreateIndex
CREATE INDEX `internships_report_feedback_document_id_fkey` ON `internships`(`report_feedback_document_id`);

-- CreateIndex
CREATE INDEX `internships_report_final_doc_id_fkey` ON `internships`(`report_final_doc_id`);

-- CreateIndex
CREATE UNIQUE INDEX `internships_student_id_proposal_id_key` ON `internships`(`student_id`, `proposal_id`);

-- AddForeignKey
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exit_survey_sessions` ADD CONSTRAINT `exit_survey_sessions_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exit_survey_questions` ADD CONSTRAINT `exit_survey_questions_exitSurveySessionId_fkey` FOREIGN KEY (`exitSurveySessionId`) REFERENCES `exit_survey_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_recommendation_document_id_fkey` FOREIGN KEY (`recommendation_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_settlement_document_id_fkey` FOREIGN KEY (`settlement_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal` ADD CONSTRAINT `thesis_proposal_doc_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal` ADD CONSTRAINT `thesis_proposal_student_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_grades` ADD CONSTRAINT `thesis_proposal_grades_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `thesis_proposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_grades` ADD CONSTRAINT `research_method_grades_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_target_company_id_fkey` FOREIGN KEY (`target_company_id`) REFERENCES `companies`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_app_letter_doc_id_fkey` FOREIGN KEY (`app_letter_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_app_letter_signed_by_id_fkey` FOREIGN KEY (`app_letter_signed_by_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_app_letter_signed_as_role_id_fkey` FOREIGN KEY (`app_letter_signed_as_role_id`) REFERENCES `user_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_company_response_doc_id_fkey` FOREIGN KEY (`company_response_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_assign_letter_doc_id_fkey` FOREIGN KEY (`assign_letter_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_assign_letter_signed_by_id_fkey` FOREIGN KEY (`assign_letter_signed_by_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_assign_letter_signed_as_role_id_fkey` FOREIGN KEY (`assign_letter_signed_as_role_id`) REFERENCES `user_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_supervisor_letters` ADD CONSTRAINT `internship_supervisor_letters_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_supervisor_letters` ADD CONSTRAINT `internship_supervisor_letters_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_supervisor_letters` ADD CONSTRAINT `internship_supervisor_letters_signed_by_id_fkey` FOREIGN KEY (`signed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_supervisor_letters` ADD CONSTRAINT `internship_supervisor_letters_signed_as_role_id_fkey` FOREIGN KEY (`signed_as_role_id`) REFERENCES `user_roles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_sup_letter_id_fkey` FOREIGN KEY (`sup_letter_id`) REFERENCES `internship_supervisor_letters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_report_document_id_fkey` FOREIGN KEY (`report_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_report_feedback_document_id_fkey` FOREIGN KEY (`report_feedback_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_field_assessment_doc_id_fkey` FOREIGN KEY (`field_assessment_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_completion_certificate_doc_id_fkey` FOREIGN KEY (`completion_certificate_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_company_receipt_doc_id_fkey` FOREIGN KEY (`company_receipt_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_company_report_doc_id_fkey` FOREIGN KEY (`company_report_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_logbook_document_id_fkey` FOREIGN KEY (`logbook_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_report_final_doc_id_fkey` FOREIGN KEY (`report_final_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_questions` ADD CONSTRAINT `internship_guidance_questions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_lecturer_criteria` ADD CONSTRAINT `internship_guidance_lecturer_criteria_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_lecturer_criteria_options` ADD CONSTRAINT `internship_guidance_lecturer_criteria_options_criteria_id_fkey` FOREIGN KEY (`criteria_id`) REFERENCES `internship_guidance_lecturer_criteria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_cpmks` ADD CONSTRAINT `internship_cpmks_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_lecturer_scores` ADD CONSTRAINT `internship_lecturer_scores_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_lecturer_scores` ADD CONSTRAINT `internship_lecturer_scores_chosen_rubric_id_fkey` FOREIGN KEY (`chosen_rubric_id`) REFERENCES `internship_assessment_rubrics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_field_scores` ADD CONSTRAINT `internship_field_scores_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_field_scores` ADD CONSTRAINT `internship_field_scores_chosen_rubric_id_fkey` FOREIGN KEY (`chosen_rubric_id`) REFERENCES `internship_assessment_rubrics`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `field_assessment_tokens` ADD CONSTRAINT `field_assessment_tokens_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
