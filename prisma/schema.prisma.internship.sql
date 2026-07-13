-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `full_name` VARCHAR(191) NOT NULL,
    `identity_number` VARCHAR(191) NOT NULL,
    `identity_type` ENUM('NIM', 'NIP', 'OTHER') NOT NULL,
    `email` VARCHAR(191) NULL,
    `password` VARCHAR(191) NULL,
    `phone_number` VARCHAR(191) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `token` TEXT NULL,
    `refresh_token` TEXT NULL,
    `oauth_provider` VARCHAR(191) NULL,
    `oauth_id` VARCHAR(191) NULL,
    `oauth_refresh_token` TEXT NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_identity_number_key`(`identity_number`),
    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_has_roles` (
    `user_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'nonActive') NOT NULL,

    INDEX `user_has_roles_role_id_fkey`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `students` (
    `user_id` VARCHAR(191) NOT NULL,
    `student_status` ENUM('dropout', 'bss', 'lulus', 'mengundurkan_diri', 'active') NOT NULL DEFAULT 'active',
    `enrollment_year` INTEGER NULL,
    `skscompleted` INTEGER NOT NULL,
    `mandatory_courses_completed` BOOLEAN NOT NULL DEFAULT false,
    `mkwu_completed` BOOLEAN NOT NULL DEFAULT false,
    `internship_completed` BOOLEAN NOT NULL DEFAULT false,
    `kkn_completed` BOOLEAN NOT NULL DEFAULT false,
    `research_method_completed` BOOLEAN NOT NULL DEFAULT false,
    `current_semester` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_students_skscompleted`(`skscompleted`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lecturers` (
    `user_id` VARCHAR(191) NOT NULL,
    `science_group_id` VARCHAR(191) NULL,
    `data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lecturers_science_group_id_fkey`(`science_group_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `science_groups` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `academic_years` (
    `id` VARCHAR(191) NOT NULL,
    `semester` ENUM('ganjil', 'genap') NOT NULL DEFAULT 'ganjil',
    `year` VARCHAR(20) NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rooms` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `location` VARCHAR(255) NULL,
    `capacity` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `document_type_id` VARCHAR(191) NULL,
    `file_path` VARCHAR(191) NULL,
    `file_name` VARCHAR(191) NULL,
    `file_hash` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `documents_document_type_id_fkey`(`document_type_id`),
    INDEX `documents_user_id_fkey`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_types` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'HTML',
    `content` LONGTEXT NULL,
    `file_path` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_templates_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `companies` (
    `id` VARCHAR(191) NOT NULL,
    `company_name` VARCHAR(191) NOT NULL,
    `company_address` VARCHAR(191) NOT NULL,
    `alasan` TEXT NULL,
    `status` ENUM('save', 'blacklist', 'diajukan') NOT NULL DEFAULT 'save',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_proposals` (
    `id` VARCHAR(191) NOT NULL,
    `coordinator_id` VARCHAR(191) NOT NULL,
    `proposal_document_id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `target_company_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED_PROPOSAL', 'REJECTED_PROPOSAL', 'WAITING_FOR_VERIFICATION', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED', 'REJECTED_BY_COMPANY') NOT NULL DEFAULT 'PENDING',
    `proposal_sekdep_notes` TEXT NULL,
    `proposed_start_date` DATE NOT NULL,
    `proposed_end_date` DATE NOT NULL,
    `app_letter_doc_number` VARCHAR(191) NULL,
    `app_letter_date_issued` DATE NULL,
    `start_date_planned` DATE NULL,
    `end_date_planned` DATE NULL,
    `app_letter_doc_id` VARCHAR(191) NULL,
    `app_letter_signed_by_id` VARCHAR(191) NULL,
    `app_letter_signed_as_role_id` VARCHAR(191) NULL,
    `company_response_doc_id` VARCHAR(191) NULL,
    `company_response_notes` TEXT NULL,
    `assign_letter_doc_number` VARCHAR(191) NULL,
    `assign_letter_date_issued` DATE NULL,
    `start_date_actual` DATE NULL,
    `end_date_actual` DATE NULL,
    `assign_letter_doc_id` VARCHAR(191) NULL,
    `assign_letter_signed_by_id` VARCHAR(191) NULL,
    `assign_letter_signed_as_role_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `internship_proposals_app_letter_doc_number_key`(`app_letter_doc_number`),
    UNIQUE INDEX `internship_proposals_assign_letter_doc_number_key`(`assign_letter_doc_number`),
    INDEX `internship_proposals_coordinator_id_fkey`(`coordinator_id`),
    INDEX `internship_proposals_proposal_document_id_fkey`(`proposal_document_id`),
    INDEX `internship_proposals_academic_year_id_fkey`(`academic_year_id`),
    INDEX `internship_proposals_target_company_id_fkey`(`target_company_id`),
    INDEX `internship_proposals_app_letter_doc_id_fkey`(`app_letter_doc_id`),
    INDEX `internship_proposals_app_letter_signed_by_id_fkey`(`app_letter_signed_by_id`),
    INDEX `internship_proposals_app_letter_signed_as_role_id_fkey`(`app_letter_signed_as_role_id`),
    INDEX `internship_proposals_company_response_doc_id_fkey`(`company_response_doc_id`),
    INDEX `internship_proposals_assign_letter_doc_id_fkey`(`assign_letter_doc_id`),
    INDEX `internship_proposals_assign_letter_signed_by_id_fkey`(`assign_letter_signed_by_id`),
    INDEX `internship_proposals_assign_letter_signed_as_role_id_fkey`(`assign_letter_signed_as_role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_supervisor_letters` (
    `id` VARCHAR(191) NOT NULL,
    `document_number` VARCHAR(191) NOT NULL,
    `date_issued` DATE NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `supervisor_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `signed_by_id` VARCHAR(191) NULL,
    `signed_as_role_id` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'SUPERSEDED') NOT NULL DEFAULT 'ACTIVE',
    `superseded_at` DATETIME(3) NULL,
    `superseded_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `internship_supervisor_letters_document_number_key`(`document_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internships` (
    `id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `proposal_id` VARCHAR(191) NOT NULL,
    `supervisor_id` VARCHAR(191) NULL,
    `field_supervisor_name` VARCHAR(191) NULL,
    `field_supervisor_email` VARCHAR(191) NULL,
    `field_supervisor_phone` VARCHAR(191) NULL,
    `field_supervisor_nip` VARCHAR(191) NULL,
    `unit_section` VARCHAR(191) NULL,
    `actual_start_date` DATE NULL,
    `actual_end_date` DATE NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY', 'ONGOING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `is_logbook_locked` BOOLEAN NOT NULL DEFAULT false,
    `logbook_locked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sup_letter_id` VARCHAR(191) NULL,
    `report_title` VARCHAR(191) NULL,
    `report_document_id` VARCHAR(191) NULL,
    `report_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    `report_notes` TEXT NULL,
    `report_uploaded_at` DATETIME(3) NULL,
    `report_feedback_document_id` VARCHAR(191) NULL,
    `lecturer_assessment_status` ENUM('PENDING', 'APPROVED', 'COMPLETED') NULL,
    `field_assessment_status` ENUM('PENDING', 'APPROVED', 'COMPLETED') NULL,
    `field_assessment_notes` TEXT NULL,
    `field_assessment_doc_id` VARCHAR(191) NULL,
    `completion_certificate_doc_id` VARCHAR(191) NULL,
    `completion_certificate_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    `completion_certificate_notes` TEXT NULL,
    `company_receipt_doc_id` VARCHAR(191) NULL,
    `company_receipt_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    `company_receipt_notes` TEXT NULL,
    `logbook_document_id` VARCHAR(191) NULL,
    `logbook_document_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    `logbook_document_notes` TEXT NULL,
    `company_report_doc_id` VARCHAR(191) NULL,
    `company_report_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    `company_report_notes` TEXT NULL,
    `field_assessment_submitted_at` DATETIME(3) NULL,
    `field_assessment_signature_hash` VARCHAR(255) NULL,
    `logbook_field_signature_hash` VARCHAR(255) NULL,
    `logbook_field_signed_at` DATETIME(3) NULL,
    `final_numeric_score` DOUBLE NULL,
    `final_grade` VARCHAR(10) NULL,

    INDEX `internships_student_id_fkey`(`student_id`),
    INDEX `internships_proposal_id_fkey`(`proposal_id`),
    INDEX `internships_supervisor_id_fkey`(`supervisor_id`),
    INDEX `internships_sup_letter_id_fkey`(`sup_letter_id`),
    INDEX `internships_field_assessment_doc_id_fkey`(`field_assessment_doc_id`),
    INDEX `internships_completion_certificate_doc_id_fkey`(`completion_certificate_doc_id`),
    INDEX `internships_company_receipt_doc_id_fkey`(`company_receipt_doc_id`),
    INDEX `internships_report_document_id_fkey`(`report_document_id`),
    INDEX `internships_report_feedback_document_id_fkey`(`report_feedback_document_id`),
    UNIQUE INDEX `internships_student_id_proposal_id_key`(`student_id`, `proposal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_logbooks` (
    `id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `activity_date` DATE NOT NULL,
    `activity_description` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_logbooks_internship_id_fkey`(`internship_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_questions` (
    `id` VARCHAR(191) NOT NULL,
    `week_number` INTEGER NOT NULL,
    `question_text` TEXT NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_lecturer_criteria` (
    `id` VARCHAR(191) NOT NULL,
    `criteria_name` VARCHAR(191) NOT NULL,
    `week_number` INTEGER NOT NULL,
    `input_type` ENUM('EVALUATION', 'TEXT') NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

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
CREATE TABLE `internship_guidance_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `week_number` INTEGER NOT NULL,
    `status` ENUM('SUBMITTED', 'LATE', 'APPROVED') NOT NULL DEFAULT 'SUBMITTED',
    `submission_date` DATE NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_guidance_sessions_internship_id_fkey`(`internship_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_student_answers` (
    `guidance_session_id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `week_number` INTEGER NOT NULL,
    `answer_text` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_guidance_student_answers_session_id_fkey`(`guidance_session_id`),
    INDEX `internship_guidance_student_answers_question_id_fkey`(`question_id`),
    PRIMARY KEY (`guidance_session_id`, `question_id`, `week_number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_lecturer_answers` (
    `guidance_session_id` VARCHAR(191) NOT NULL,
    `criteria_id` VARCHAR(191) NOT NULL,
    `week_number` INTEGER NOT NULL,
    `evaluation_value` VARCHAR(191) NULL,
    `answer_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_guidance_lecturer_answers_session_id_fkey`(`guidance_session_id`),
    INDEX `internship_guidance_lecturer_answers_criteria_id_fkey`(`criteria_id`),
    PRIMARY KEY (`guidance_session_id`, `criteria_id`, `week_number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_seminars` (
    `id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `seminar_date` DATE NOT NULL,
    `start_time` TIME(0) NOT NULL,
    `end_time` TIME(0) NOT NULL,
    `link_meeting` VARCHAR(191) NULL,
    `moderator_student_id` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'REQUESTED',
    `approved_by` VARCHAR(191) NULL,
    `supervisor_notes` TEXT NULL,
    `berita_acara_document_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_seminars_internship_id_fkey`(`internship_id`),
    INDEX `internship_seminars_room_id_fkey`(`room_id`),
    INDEX `internship_seminars_moderator_student_id_fkey`(`moderator_student_id`),
    INDEX `internship_seminars_approved_by_fkey`(`approved_by`),
    INDEX `internship_seminars_berita_acara_document_id_fkey`(`berita_acara_document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_seminar_audiences` (
    `seminar_id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'VALIDATED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `validated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_seminar_audiences_seminar_id_fkey`(`seminar_id`),
    INDEX `internship_seminar_audiences_student_id_fkey`(`student_id`),
    PRIMARY KEY (`seminar_id`, `student_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_cpmks` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `weight` DOUBLE NOT NULL,
    `assessor_type` VARCHAR(20) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_assessment_rubrics` (
    `id` VARCHAR(191) NOT NULL,
    `cpmk_id` VARCHAR(191) NOT NULL,
    `level_name` VARCHAR(191) NOT NULL,
    `rubric_level_description` TEXT NOT NULL,
    `min_score` DOUBLE NOT NULL,
    `max_score` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_assessment_rubrics_cpmk_id_fkey`(`cpmk_id`),
    UNIQUE INDEX `internship_assessment_rubrics_cpmk_id_min_score_key`(`cpmk_id`, `min_score`),
    UNIQUE INDEX `internship_assessment_rubrics_cpmk_id_max_score_key`(`cpmk_id`, `max_score`),
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

-- CreateTable
CREATE TABLE `supervisor_replacement_requests` (
    `id` VARCHAR(191) NOT NULL,
    `letter_id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `old_supervisor_id` VARCHAR(191) NOT NULL,
    `new_supervisor_id` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `requested_by_id` VARCHAR(191) NOT NULL,
    `approved_by_id` VARCHAR(191) NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `rejection_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `supervisor_replacement_requests_letter_id_idx`(`letter_id`),
    INDEX `supervisor_replacement_requests_internship_id_idx`(`internship_id`),
    INDEX `supervisor_replacement_requests_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_has_roles` ADD CONSTRAINT `user_has_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `user_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_has_roles` ADD CONSTRAINT `user_has_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturers` ADD CONSTRAINT `lecturers_science_group_id_fkey` FOREIGN KEY (`science_group_id`) REFERENCES `science_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturers` ADD CONSTRAINT `lecturers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_coordinator_id_fkey` FOREIGN KEY (`coordinator_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_proposal_document_id_fkey` FOREIGN KEY (`proposal_document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_proposals` ADD CONSTRAINT `internship_proposals_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `internships` ADD CONSTRAINT `internships_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `internship_proposals`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internships` ADD CONSTRAINT `internships_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `internship_logbooks` ADD CONSTRAINT `internship_logbooks_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_questions` ADD CONSTRAINT `internship_guidance_questions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_lecturer_criteria` ADD CONSTRAINT `internship_guidance_lecturer_criteria_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_lecturer_criteria_options` ADD CONSTRAINT `internship_guidance_lecturer_criteria_options_criteria_id_fkey` FOREIGN KEY (`criteria_id`) REFERENCES `internship_guidance_lecturer_criteria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_sessions` ADD CONSTRAINT `internship_guidance_sessions_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_student_answers` ADD CONSTRAINT `internship_guidance_student_answers_guidance_session_id_fkey` FOREIGN KEY (`guidance_session_id`) REFERENCES `internship_guidance_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_student_answers` ADD CONSTRAINT `internship_guidance_student_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `internship_guidance_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_lecturer_answers` ADD CONSTRAINT `internship_guidance_lecturer_answers_guidance_session_id_fkey` FOREIGN KEY (`guidance_session_id`) REFERENCES `internship_guidance_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_guidance_lecturer_answers` ADD CONSTRAINT `internship_guidance_lecturer_answers_criteria_id_fkey` FOREIGN KEY (`criteria_id`) REFERENCES `internship_guidance_lecturer_criteria`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminars` ADD CONSTRAINT `internship_seminars_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminars` ADD CONSTRAINT `internship_seminars_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminars` ADD CONSTRAINT `internship_seminars_moderator_student_id_fkey` FOREIGN KEY (`moderator_student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminars` ADD CONSTRAINT `internship_seminars_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminars` ADD CONSTRAINT `internship_seminars_berita_acara_document_id_fkey` FOREIGN KEY (`berita_acara_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminar_audiences` ADD CONSTRAINT `internship_seminar_audiences_seminar_id_fkey` FOREIGN KEY (`seminar_id`) REFERENCES `internship_seminars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_seminar_audiences` ADD CONSTRAINT `internship_seminar_audiences_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_cpmks` ADD CONSTRAINT `internship_cpmks_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `internship_assessment_rubrics` ADD CONSTRAINT `internship_assessment_rubrics_cpmk_id_fkey` FOREIGN KEY (`cpmk_id`) REFERENCES `internship_cpmks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE `supervisor_replacement_requests` ADD CONSTRAINT `supervisor_replacement_requests_letter_id_fkey` FOREIGN KEY (`letter_id`) REFERENCES `internship_supervisor_letters`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisor_replacement_requests` ADD CONSTRAINT `supervisor_replacement_requests_internship_id_fkey` FOREIGN KEY (`internship_id`) REFERENCES `internships`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisor_replacement_requests` ADD CONSTRAINT `supervisor_replacement_requests_old_supervisor_id_fkey` FOREIGN KEY (`old_supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisor_replacement_requests` ADD CONSTRAINT `supervisor_replacement_requests_new_supervisor_id_fkey` FOREIGN KEY (`new_supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisor_replacement_requests` ADD CONSTRAINT `supervisor_replacement_requests_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervisor_replacement_requests` ADD CONSTRAINT `supervisor_replacement_requests_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
