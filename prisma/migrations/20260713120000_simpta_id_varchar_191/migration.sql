-- SIMPTA cluster: standardize UUID id/FK columns to VARCHAR(191).
-- Rationale: FK columns were declared wider (VarChar(255)/(199)) than the
-- referenced primary keys (VarChar(191)), causing FK<->PK type mismatches
-- (audit finding A-01/A-02). All affected values are 36-char UUIDs, so the
-- MODIFY ... VARCHAR(191) is lossless. Scope: SIMPTA-owned tables + 3
-- SIMPTA-scope columns on `thesis`. No non-SIMPTA table is touched.
--
-- NOTE: Generated offline via `prisma migrate diff` because this machine's
-- migration history is in an inconsistent state (OneDrive on-demand files).
-- Apply with `npx prisma migrate deploy` AFTER confirming migration history
-- is fully hydrated/consistent.

-- DropForeignKey
ALTER TABLE `metopen_cpmks` DROP FOREIGN KEY `metopen_cpmks_academic_year_id_fkey`;

-- DropForeignKey
ALTER TABLE `metopen_assessment_criterias` DROP FOREIGN KEY `metopen_assessment_criterias_metopen_cpmk_id_fkey`;

-- DropForeignKey
ALTER TABLE `metopen_assessment_rubrics` DROP FOREIGN KEY `metopen_assessment_rubrics_metopen_assessment_criteria_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis` DROP FOREIGN KEY `thesis_final_proposal_version_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis` DROP FOREIGN KEY `thesis_proposal_reviewed_by_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis` DROP FOREIGN KEY `thesis_ta04_assignment_issued_by_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request_draft` DROP FOREIGN KEY `thesis_advisor_request_draft_student_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request_draft` DROP FOREIGN KEY `thesis_advisor_request_draft_lecturer_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request_draft` DROP FOREIGN KEY `thesis_advisor_request_draft_topic_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request_draft` DROP FOREIGN KEY `thesis_advisor_request_draft_attachment_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_student_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_lecturer_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_topic_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_thesis_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_academic_year_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_released_academic_year_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_reviewed_by_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_redirected_to_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_forwarded_by_lecturer_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_advisor_request` DROP FOREIGN KEY `thesis_advisor_request_attachment_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_proposal_versions` DROP FOREIGN KEY `thesis_proposal_versions_thesis_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_proposal_versions` DROP FOREIGN KEY `thesis_proposal_versions_document_id_fkey`;

-- DropForeignKey
ALTER TABLE `thesis_proposal_versions` DROP FOREIGN KEY `thesis_proposal_versions_submitted_as_final_by_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_thesis_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_supervisor_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_lecturer_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_co_signed_by_lecturer_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_finalized_by_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_attendance_record_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_score_details` DROP FOREIGN KEY `research_method_score_details_research_method_score_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_score_details` DROP FOREIGN KEY `research_method_score_details_assessment_criteria_id_fkey`;

-- DropForeignKey
ALTER TABLE `research_method_score_details` DROP FOREIGN KEY `research_method_score_details_assessment_rubric_id_fkey`;

-- DropForeignKey
ALTER TABLE `metopen_attendance_imports` DROP FOREIGN KEY `metopen_attendance_imports_academic_year_id_fkey`;

-- DropForeignKey
ALTER TABLE `metopen_attendance_records` DROP FOREIGN KEY `metopen_attendance_records_import_id_fkey`;

-- AlterTable
ALTER TABLE `metopen_cpmks` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `academic_year_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `metopen_assessment_criterias` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `metopen_cpmk_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `metopen_assessment_rubrics` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `metopen_assessment_criteria_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `thesis` MODIFY `final_proposal_version_id` VARCHAR(191) NULL,
    MODIFY `proposal_reviewed_by_user_id` VARCHAR(191) NULL,
    MODIFY `ta04_assignment_issued_by_user_id` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `thesis_advisor_request_draft` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `student_id` VARCHAR(191) NOT NULL,
    MODIFY `lecturer_id` VARCHAR(191) NULL,
    MODIFY `topic_id` VARCHAR(191) NULL,
    MODIFY `attachment_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `thesis_advisor_request` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `student_id` VARCHAR(191) NOT NULL,
    MODIFY `lecturer_id` VARCHAR(191) NULL,
    MODIFY `academic_year_id` VARCHAR(191) NOT NULL,
    MODIFY `topic_id` VARCHAR(191) NULL,
    MODIFY `thesis_id` VARCHAR(191) NULL,
    MODIFY `reviewed_by` VARCHAR(191) NULL,
    MODIFY `released_academic_year_id` VARCHAR(191) NULL,
    MODIFY `redirected_to` VARCHAR(191) NULL,
    MODIFY `attachment_id` VARCHAR(191) NULL,
    MODIFY `forwarded_by_lecturer_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `thesis_proposal_versions` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `thesis_id` VARCHAR(191) NOT NULL,
    MODIFY `document_id` VARCHAR(191) NOT NULL,
    MODIFY `submitted_as_final_by_user_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `research_method_scores` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `thesis_id` VARCHAR(191) NOT NULL,
    MODIFY `supervisor_id` VARCHAR(191) NULL,
    MODIFY `lecturer_id` VARCHAR(191) NULL,
    MODIFY `finalized_by` VARCHAR(191) NULL,
    MODIFY `attendance_record_id` VARCHAR(191) NULL,
    MODIFY `co_signed_by_lecturer_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `research_method_score_details` DROP PRIMARY KEY,
    MODIFY `research_method_score_id` VARCHAR(191) NOT NULL,
    MODIFY `assessment_criteria_id` VARCHAR(191) NOT NULL,
    MODIFY `assessment_rubric_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`research_method_score_id`, `assessment_criteria_id`);

-- AlterTable
ALTER TABLE `metopen_attendance_imports` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `academic_year_id` VARCHAR(191) NULL,
    ADD PRIMARY KEY (`id`);

-- AlterTable
ALTER TABLE `metopen_attendance_records` DROP PRIMARY KEY,
    MODIFY `id` VARCHAR(191) NOT NULL,
    MODIFY `import_id` VARCHAR(191) NOT NULL,
    ADD PRIMARY KEY (`id`);

-- AddForeignKey
ALTER TABLE `metopen_cpmks` ADD CONSTRAINT `metopen_cpmks_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_assessment_criterias` ADD CONSTRAINT `metopen_assessment_criterias_metopen_cpmk_id_fkey` FOREIGN KEY (`metopen_cpmk_id`) REFERENCES `metopen_cpmks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_assessment_rubrics` ADD CONSTRAINT `metopen_assessment_rubrics_metopen_assessment_criteria_id_fkey` FOREIGN KEY (`metopen_assessment_criteria_id`) REFERENCES `metopen_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_final_proposal_version_id_fkey` FOREIGN KEY (`final_proposal_version_id`) REFERENCES `thesis_proposal_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_proposal_reviewed_by_user_id_fkey` FOREIGN KEY (`proposal_reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_ta04_assignment_issued_by_user_id_fkey` FOREIGN KEY (`ta04_assignment_issued_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request_draft` ADD CONSTRAINT `thesis_advisor_request_draft_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request_draft` ADD CONSTRAINT `thesis_advisor_request_draft_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request_draft` ADD CONSTRAINT `thesis_advisor_request_draft_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request_draft` ADD CONSTRAINT `thesis_advisor_request_draft_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_released_academic_year_id_fkey` FOREIGN KEY (`released_academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_redirected_to_fkey` FOREIGN KEY (`redirected_to`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_forwarded_by_lecturer_id_fkey` FOREIGN KEY (`forwarded_by_lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_attachment_id_fkey` FOREIGN KEY (`attachment_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_versions` ADD CONSTRAINT `thesis_proposal_versions_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_versions` ADD CONSTRAINT `thesis_proposal_versions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_versions` ADD CONSTRAINT `thesis_proposal_versions_submitted_as_final_by_user_id_fkey` FOREIGN KEY (`submitted_as_final_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_co_signed_by_lecturer_id_fkey` FOREIGN KEY (`co_signed_by_lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_finalized_by_fkey` FOREIGN KEY (`finalized_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_attendance_record_id_fkey` FOREIGN KEY (`attendance_record_id`) REFERENCES `metopen_attendance_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_score_details` ADD CONSTRAINT `research_method_score_details_research_method_score_id_fkey` FOREIGN KEY (`research_method_score_id`) REFERENCES `research_method_scores`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_score_details` ADD CONSTRAINT `research_method_score_details_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `metopen_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_score_details` ADD CONSTRAINT `research_method_score_details_assessment_rubric_id_fkey` FOREIGN KEY (`assessment_rubric_id`) REFERENCES `metopen_assessment_rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_imports` ADD CONSTRAINT `metopen_attendance_imports_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_records` ADD CONSTRAINT `metopen_attendance_records_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `metopen_attendance_imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
