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

    UNIQUE INDEX `user_roles_name_key`(`name`),
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
    `eligible_metopen` BOOLEAN NULL,
    `metopen_eligibility_source` ENUM('sia', 'devtools') NULL,
    `metopen_eligibility_updated_at` DATETIME(3) NULL,
    `taking_thesis_course` BOOLEAN NULL,
    `thesis_course_enrollment_source` ENUM('sia', 'devtools') NULL,
    `thesis_course_enrollment_updated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_students_skscompleted`(`skscompleted`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_cpl_scores` (
    `student_id` VARCHAR(199) NOT NULL,
    `cpl_id` VARCHAR(255) NOT NULL,
    `input_by` VARCHAR(255) NULL,
    `verified_by` VARCHAR(255) NULL,
    `input_at` DATETIME(3) NULL,
    `score` INTEGER NOT NULL,
    `source` ENUM('SIA', 'manual') NOT NULL DEFAULT 'SIA',
    `status` ENUM('calculated', 'verified', 'finalized') NOT NULL DEFAULT 'calculated',
    `verified_at` DATETIME(3) NULL,
    `finalized_at` DATETIME(3) NULL,

    INDEX `student_cpl_scores_cpl_id_fkey`(`cpl_id`),
    INDEX `student_cpl_scores_input_by_fkey`(`input_by`),
    INDEX `student_cpl_scores_verified_by_fkey`(`verified_by`),
    PRIMARY KEY (`student_id`, `cpl_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lecturers` (
    `user_id` VARCHAR(191) NOT NULL,
    `science_group_id` VARCHAR(191) NULL,
    `data` JSON NULL,
    `accepting_requests` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lecturers_science_group_id_fkey`(`science_group_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lecturer_availabilities` (
    `id` VARCHAR(255) NOT NULL,
    `lecturer_id` VARCHAR(255) NOT NULL,
    `day` ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday') NOT NULL,
    `start_time` TIME(0) NOT NULL,
    `end_time` TIME(0) NOT NULL,
    `valid_from` DATE NOT NULL,
    `valid_until` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lecturer_availabilities_lecturer_id_idx`(`lecturer_id`),
    PRIMARY KEY (`id`)
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
    `year` VARCHAR(20) NOT NULL,
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `active_key` VARCHAR(16) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `academic_years_active_key_key`(`active_key`),
    INDEX `academic_years_start_date_end_date_idx`(`start_date`, `end_date`),
    UNIQUE INDEX `academic_years_year_semester_key`(`year`, `semester`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_academic_year_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `eligible_metopen` BOOLEAN NULL,
    `research_method_completed` BOOLEAN NULL,
    `taking_thesis_course` BOOLEAN NULL,
    `eligibility_source` ENUM('sia', 'devtools') NULL,
    `eligibility_captured_at` DATETIME(3) NULL,
    `thesis_course_source` ENUM('sia', 'devtools') NULL,
    `thesis_course_captured_at` DATETIME(3) NULL,
    `captured_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `student_ay_snapshots_period_course_idx`(`academic_year_id`, `taking_thesis_course`),
    INDEX `student_ay_snapshots_captured_at_idx`(`captured_at`),
    UNIQUE INDEX `student_ay_snapshots_student_period_key`(`student_id`, `academic_year_id`),
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
CREATE TABLE `curriculums` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `start_year` INTEGER NOT NULL,
    `end_year` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cpls` (
    `id` VARCHAR(191) NOT NULL,
    `curriculum_id` VARCHAR(255) NULL,
    `code` VARCHAR(255) NULL,
    `description` VARCHAR(255) NOT NULL,
    `minimal_score` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cpls_curriculum_id_code_key`(`curriculum_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cpmks` (
    `id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NULL,
    `cpl_id` VARCHAR(255) NULL,
    `code` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `type` ENUM('research_method', 'thesis') NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cpmks_academic_year_id_fkey`(`academic_year_id`),
    INDEX `cpmks_cpl_id_idx`(`cpl_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_cpmks` (
    `id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_cpmks_academic_year_id_fkey`(`academic_year_id`),
    UNIQUE INDEX `thesis_cpmks_academic_year_id_code_key`(`academic_year_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_assessment_criterias` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_cpmk_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `max_score` INTEGER NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_assessment_criterias_thesis_cpmk_id_fkey`(`thesis_cpmk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_assessment_rubrics` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_seminar_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `min_score` INTEGER NOT NULL,
    `max_score` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_assessment_rubrics_assessment_criteria_id_fkey`(`thesis_seminar_assessment_criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_examiner_assessment_criterias` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_cpmk_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `max_score` INTEGER NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_examiner_assessment_criterias_thesis_cpmk_id_fkey`(`thesis_cpmk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_examiner_assessment_rubrics` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_defence_examiner_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `min_score` INTEGER NOT NULL,
    `max_score` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tdea_rubrics_criteria`(`thesis_defence_examiner_assessment_criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_supervisor_assessment_criterias` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_cpmk_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `max_score` INTEGER NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tdsa_criterias_cpmk`(`thesis_cpmk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_supervisor_assessment_rubrics` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_defence_supervisor_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `min_score` INTEGER NOT NULL,
    `max_score` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tdsa_rubrics_criteria`(`thesis_defence_supervisor_assessment_criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_criterias` (
    `id` VARCHAR(255) NOT NULL,
    `cpmk_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NULL,
    `applies_to` ENUM('seminar', 'defence', 'proposal', 'metopen') NOT NULL,
    `role` ENUM('default', 'examiner', 'supervisor') NOT NULL DEFAULT 'default',
    `max_score` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `assessment_criterias_cpmk_id_fkey`(`cpmk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_rubrics` (
    `id` VARCHAR(255) NOT NULL,
    `assessment_criteria_id` VARCHAR(255) NOT NULL,
    `min_score` INTEGER NOT NULL DEFAULT 0,
    `max_score` INTEGER NOT NULL DEFAULT 0,
    `description` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `assessment_rubrics_assessment_criteria_id_fkey`(`assessment_criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metopen_cpmks` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `metopen_cpmks_academic_year_id_fkey`(`academic_year_id`),
    UNIQUE INDEX `metopen_cpmks_period_code_key`(`academic_year_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metopen_score_compositions` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `ta03a_cap` INTEGER NOT NULL DEFAULT 75,
    `ta03b_cap` INTEGER NOT NULL DEFAULT 25,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `metopen_score_compositions_academic_year_id_key`(`academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metopen_assessment_criterias` (
    `id` VARCHAR(191) NOT NULL,
    `metopen_cpmk_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NULL,
    `role` ENUM('default', 'examiner', 'supervisor') NOT NULL DEFAULT 'default',
    `max_score` INTEGER NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `metopen_assessment_criterias_metopen_cpmk_id_fkey`(`metopen_cpmk_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metopen_assessment_rubrics` (
    `id` VARCHAR(191) NOT NULL,
    `metopen_assessment_criteria_id` VARCHAR(191) NOT NULL,
    `min_score` INTEGER NOT NULL DEFAULT 0,
    `max_score` INTEGER NOT NULL DEFAULT 0,
    `description` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `metopen_assessment_rubrics_metopen_assessment_criteria_id_fkey`(`metopen_assessment_criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exit_survey_forms` (
    `id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exit_survey_sessions` (
    `id` VARCHAR(255) NOT NULL,
    `exit_survey_form_id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exit_survey_sessions_exit_survey_form_id_fkey`(`exit_survey_form_id`),
    UNIQUE INDEX `exit_survey_sessions_id_exit_survey_form_id_key`(`id`, `exit_survey_form_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exit_survey_questions` (
    `id` VARCHAR(255) NOT NULL,
    `exit_survey_session_id` VARCHAR(255) NOT NULL,
    `exit_survey_form_id` VARCHAR(255) NOT NULL,
    `question` TEXT NOT NULL,
    `description` TEXT NULL,
    `question_type` ENUM('single_choice', 'multiple_choice', 'text', 'textarea') NOT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `order_number` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exit_survey_questions_exit_survey_session_id_fkey`(`exit_survey_session_id`, `exit_survey_form_id`),
    INDEX `exit_survey_questions_exit_survey_form_id_fkey`(`exit_survey_form_id`),
    UNIQUE INDEX `exit_survey_questions_id_exit_survey_form_id_key`(`id`, `exit_survey_form_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exit_survey_options` (
    `id` VARCHAR(255) NOT NULL,
    `exit_survey_question_id` VARCHAR(255) NOT NULL,
    `option_text` VARCHAR(255) NOT NULL,
    `order_number` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exit_survey_options_exit_survey_question_id_fkey`(`exit_survey_question_id`),
    UNIQUE INDEX `exit_survey_options_id_exit_survey_question_id_key`(`id`, `exit_survey_question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis` (
    `id` VARCHAR(191) NOT NULL,
    `is_proposal` BOOLEAN NOT NULL DEFAULT true,
    `student_id` VARCHAR(191) NOT NULL,
    `thesis_topic_id` VARCHAR(191) NULL,
    `thesis_status_id` VARCHAR(191) NULL,
    `academic_year_id` VARCHAR(191) NULL,
    `title` TEXT NULL,
    `start_date` DATETIME(3) NULL,
    `final_proposal_version_id` VARCHAR(191) NULL,
    `proposal_status` ENUM('submitted', 'accepted', 'rejected', 'revision_in_progress') NULL,
    `title_approval_document_id` VARCHAR(191) NULL,
    `proposal_review_notes` TEXT NULL,
    `proposal_reviewed_at` DATETIME(3) NULL,
    `proposal_reviewed_by_user_id` VARCHAR(191) NULL,
    `ta04_assignment_issued_at` DATETIME(3) NULL,
    `ta04_assignment_issued_by_user_id` VARCHAR(191) NULL,
    `ta04_assignment_title` TEXT NULL,
    `ta04_assignment_supervisor_names` TEXT NULL,
    `ta04_assignment_academic_year_id` VARCHAR(191) NULL,
    `active_academic_year_id` VARCHAR(191) NULL,
    `active_promoted_at` DATETIME(3) NULL,
    `rating` ENUM('ONGOING', 'SLOW', 'AT_RISK', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'ONGOING',
    `deadline_date` DATETIME(3) NULL,
    `final_thesis_document_id` VARCHAR(191) NULL,
    `defence_requested_at` DATETIME(3) NULL,
    `proposal_document_id` VARCHAR(191) NULL,
    `document_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_academic_year_id_fkey`(`academic_year_id`),
    INDEX `thesis_document_id_fkey`(`document_id`),
    INDEX `thesis_final_thesis_document_id_fkey`(`final_thesis_document_id`),
    INDEX `thesis_proposal_document_id_fkey`(`proposal_document_id`),
    INDEX `thesis_final_proposal_version_id_fkey`(`final_proposal_version_id`),
    INDEX `thesis_title_approval_document_id_idx`(`title_approval_document_id`),
    INDEX `thesis_proposal_reviewed_by_user_id_fkey`(`proposal_reviewed_by_user_id`),
    INDEX `thesis_ta04_assignment_issued_by_user_id_fkey`(`ta04_assignment_issued_by_user_id`),
    INDEX `thesis_ta04_assignment_academic_year_id_fkey`(`ta04_assignment_academic_year_id`),
    INDEX `thesis_active_academic_year_id_fkey`(`active_academic_year_id`),
    INDEX `thesis_student_id_fkey`(`student_id`),
    INDEX `thesis_thesis_status_id_fkey`(`thesis_status_id`),
    INDEX `thesis_thesis_topic_id_fkey`(`thesis_topic_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ta04_batches` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(32) NOT NULL DEFAULT 'current',
    `cohort_hash` VARCHAR(64) NOT NULL,
    `generated_by_user_id` VARCHAR(191) NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ta04_batches_academic_year_id_status_idx`(`academic_year_id`, `status`),
    INDEX `ta04_batches_document_id_idx`(`document_id`),
    INDEX `ta04_batches_generated_by_user_id_idx`(`generated_by_user_id`),
    INDEX `ta04_batches_cohort_hash_idx`(`cohort_hash`),
    UNIQUE INDEX `ta04_batches_academic_year_id_version_key`(`academic_year_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ta04_batch_members` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `student_name` VARCHAR(191) NOT NULL,
    `student_nim` VARCHAR(50) NOT NULL,
    `title` TEXT NOT NULL,
    `supervisor_names` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ta04_batch_members_thesis_id_idx`(`thesis_id`),
    UNIQUE INDEX `ta04_batch_members_batch_id_thesis_id_key`(`batch_id`, `thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_student_informal_logs` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_student_informal_logs_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_student_informal_logs_student_id_fkey`(`student_id`),
    INDEX `thesis_student_informal_logs_document_id_fkey`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_change_requests` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NULL,
    `request_type` ENUM('topic', 'supervisor', 'both') NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `reviewed_by` VARCHAR(191) NULL,
    `review_notes` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `new_topic_id` VARCHAR(191) NULL,
    `new_title` VARCHAR(500) NULL,
    `new_supervisor_id` VARCHAR(191) NULL,
    `supporting_document_id` VARCHAR(191) NULL,
    `replaced_supervisor_lecturer_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_change_requests_reviewed_by_fkey`(`reviewed_by`),
    INDEX `thesis_change_requests_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_change_requests_new_topic_id_idx`(`new_topic_id`),
    INDEX `thesis_change_requests_new_supervisor_id_idx`(`new_supervisor_id`),
    INDEX `thesis_change_requests_supporting_document_id_idx`(`supporting_document_id`),
    INDEX `thesis_change_requests_replaced_supervisor_lecturer_id_idx`(`replaced_supervisor_lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_change_request_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `notes` TEXT NULL,
    `approval_tier` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_change_request_approvals_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_change_request_approvals_request_id_approval_tier_idx`(`request_id`, `approval_tier`),
    UNIQUE INDEX `thesis_change_request_approvals_request_id_lecturer_id_key`(`request_id`, `lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_supervisors` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `status` ENUM('active', 'terminated', 'released') NOT NULL DEFAULT 'active',
    `active_role_key` VARCHAR(191) NULL,
    `seminar_ready` BOOLEAN NOT NULL DEFAULT false,
    `defence_ready` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `thesis_supervisors_active_role_key_key`(`active_role_key`),
    INDEX `thesis_participants_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_participants_role_id_fkey`(`role_id`),
    INDEX `thesis_participants_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_supervisors_thesis_id_role_id_status_idx`(`thesis_id`, `role_id`, `status`),
    UNIQUE INDEX `thesis_supervisors_id_thesis_id_key`(`id`, `thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_guidance_evaluations` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `thesis_supervisor_id` VARCHAR(191) NOT NULL,
    `evaluation_type` ENUM('six_month', 'one_year') NOT NULL,
    `recommendation` ENUM('extend_1_month', 'revise_proposal', 'terminate_supervision') NOT NULL,
    `notes` TEXT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `kadep_approved_by` VARCHAR(191) NULL,
    `kadep_approved_at` DATETIME(3) NULL,
    `kadep_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_guidance_evaluations_thesis_id_idx`(`thesis_id`),
    INDEX `thesis_guidance_evaluations_thesis_supervisor_id_idx`(`thesis_supervisor_id`),
    INDEX `thesis_guidance_evaluations_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_topics` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `science_group_id` VARCHAR(191) NULL,
    `lecturer_id` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_topics_science_group_id_idx`(`science_group_id`),
    INDEX `thesis_topics_lecturer_id_idx`(`lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_status` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `thesis_status_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_milestone_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `topic_id` VARCHAR(191) NULL,
    `phase` ENUM('metopen', 'thesis') NOT NULL DEFAULT 'metopen',
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `default_due_days` INTEGER NULL,
    `default_due_date` DATETIME(3) NULL,
    `weight_percentage` INTEGER NULL,
    `requires_advisor` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_milestone_templates_topic_id_fkey`(`topic_id`),
    INDEX `thesis_milestone_templates_phase_idx`(`phase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_milestones` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `milestone_template_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `target_date` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `submitted_at` DATETIME(3) NULL,
    `status` ENUM('not_started', 'in_progress', 'pending_review', 'revision_needed', 'completed', 'deleted') NOT NULL DEFAULT 'not_started',
    `progress_percentage` INTEGER NOT NULL DEFAULT 0,
    `validated_by` VARCHAR(191) NULL,
    `validated_at` DATETIME(3) NULL,
    `supervisor_notes` TEXT NULL,
    `student_notes` TEXT NULL,
    `feedback` TEXT NULL,
    `assessed_by` VARCHAR(191) NULL,
    `assessed_at` DATETIME(3) NULL,
    `total_score` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_milestones_thesis_id_order_index_idx`(`thesis_id`, `order_index`),
    INDEX `thesis_milestones_thesis_id_status_idx`(`thesis_id`, `status`),
    INDEX `thesis_milestones_milestone_template_id_idx`(`milestone_template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_guidance_milestones` (
    `guidance_id` VARCHAR(191) NOT NULL,
    `milestone_id` VARCHAR(191) NOT NULL,

    INDEX `thesis_guidance_milestones_milestone_id_idx`(`milestone_id`),
    PRIMARY KEY (`guidance_id`, `milestone_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_template_criterias` (
    `milestone_template_id` VARCHAR(191) NOT NULL,
    `assessment_criteria_id` VARCHAR(191) NOT NULL,
    `weight_percentage` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `milestone_template_criterias_assessment_criteria_id_idx`(`assessment_criteria_id`),
    PRIMARY KEY (`milestone_template_id`, `assessment_criteria_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `milestone_template_attachments` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `milestone_template_attachments_template_id_idx`(`template_id`),
    INDEX `milestone_template_attachments_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_milestone_documents` (
    `id` VARCHAR(191) NOT NULL,
    `milestone_id` VARCHAR(191) NOT NULL,
    `file_path` VARCHAR(191) NULL,
    `file_name` VARCHAR(191) NULL,
    `file_size` INTEGER NULL,
    `mime_type` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_latest` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `thesis_milestone_documents_milestone_id_idx`(`milestone_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_milestone_assessment_details` (
    `id` VARCHAR(191) NOT NULL,
    `milestone_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `rubric_id` VARCHAR(191) NULL,
    `score` INTEGER NOT NULL,
    `notes` TEXT NULL,
    `assessed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_milestone_assessment_details_milestone_id_idx`(`milestone_id`),
    INDEX `thesis_milestone_assessment_details_lecturer_id_idx`(`lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_guidances` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `supervisor_id` VARCHAR(191) NULL,
    `requested_date` DATETIME(3) NOT NULL,
    `approved_date` DATETIME(3) NULL,
    `duration` INTEGER NOT NULL DEFAULT 60,
    `document_id` VARCHAR(191) NULL,
    `document_url` VARCHAR(191) NULL,
    `student_notes` TEXT NULL,
    `supervisor_feedback` TEXT NULL,
    `rejection_reason` TEXT NULL,
    `session_summary` TEXT NULL,
    `action_items` TEXT NULL,
    `summary_submitted_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `status` ENUM('requested', 'accepted', 'rescheduled', 'rejected', 'summary_pending', 'summary_rejected', 'completed', 'cancelled', 'deleted') NOT NULL DEFAULT 'requested',
    `phase` ENUM('proposal', 'thesis') NOT NULL DEFAULT 'proposal',
    `student_calendar_event_id` VARCHAR(191) NULL,
    `supervisor_calendar_event_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_guidances_thesis_id_idx`(`thesis_id`),
    INDEX `thesis_guidances_document_id_fkey`(`document_id`),
    INDEX `thesis_guidances_supervisor_id_fkey`(`supervisor_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminars` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NULL,
    `registered_at` DATETIME(3) NULL,
    `date` DATE NULL,
    `start_time` TIME(0) NULL,
    `end_time` TIME(0) NULL,
    `meeting_link` VARCHAR(255) NULL,
    `status` ENUM('registered', 'verified', 'examiner_assigned', 'scheduled', 'passed', 'passed_with_revision', 'failed', 'cancelled') NOT NULL DEFAULT 'registered',
    `final_score` DOUBLE NULL,
    `result_finalized_at` DATETIME(3) NULL,
    `result_finalized_by` VARCHAR(255) NULL,
    `revision_finalized_at` DATETIME(3) NULL,
    `revision_finalized_by` VARCHAR(255) NULL,
    `cancelled_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminars_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_seminars_room_id_fkey`(`room_id`),
    INDEX `thesis_seminars_result_finalized_by_fkey`(`result_finalized_by`, `thesis_id`),
    INDEX `thesis_seminars_finalized_by_fkey`(`revision_finalized_by`, `thesis_id`),
    UNIQUE INDEX `thesis_seminars_id_thesis_id_key`(`id`, `thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_requirements` (
    `id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_requirements_academic_year_id_fkey`(`academic_year_id`),
    UNIQUE INDEX `thesis_seminar_requirements_academic_year_id_code_key`(`academic_year_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_requirement_documents` (
    `thesis_seminar_id` VARCHAR(255) NOT NULL,
    `thesis_seminar_requirement_id` VARCHAR(255) NOT NULL,
    `verified_by` VARCHAR(255) NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL,
    `status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
    `notes` TEXT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_requirement_documents_requirement_id_fkey`(`thesis_seminar_requirement_id`),
    INDEX `thesis_seminar_requirement_documents_verified_by_fkey`(`verified_by`),
    PRIMARY KEY (`thesis_seminar_id`, `thesis_seminar_requirement_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_documents` (
    `thesis_seminar_id` VARCHAR(255) NOT NULL,
    `document_type_id` VARCHAR(255) NOT NULL,
    `document_id` VARCHAR(255) NOT NULL,
    `verified_by` VARCHAR(255) NULL,
    `submitted_at` DATETIME(3) NOT NULL,
    `status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
    `notes` TEXT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_documents_verified_by_fkey`(`verified_by`),
    INDEX `thesis_seminar_documents_document_id_idx`(`document_id`),
    PRIMARY KEY (`thesis_seminar_id`, `document_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_audiences` (
    `thesis_seminar_id` VARCHAR(255) NOT NULL,
    `thesis_id` VARCHAR(255) NOT NULL,
    `student_id` VARCHAR(255) NOT NULL,
    `approved_by` VARCHAR(255) NULL,
    `registered_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_audiences_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_seminar_audiences_student_id_fkey`(`student_id`),
    INDEX `thesis_seminar_audiences_approved_by_fkey`(`approved_by`, `thesis_id`),
    PRIMARY KEY (`thesis_seminar_id`, `student_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_examiners` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_seminar_id` VARCHAR(255) NOT NULL,
    `lecturer_id` VARCHAR(255) NOT NULL,
    `assigned_by` VARCHAR(255) NOT NULL,
    `order` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL,
    `availability_status` ENUM('pending', 'available', 'unavailable') NOT NULL DEFAULT 'pending',
    `unavailable_reasons` TEXT NULL,
    `responded_at` DATETIME(3) NULL,
    `assessment_score` INTEGER NULL,
    `assessment_submitted_at` DATETIME(3) NULL,
    `revision_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_examiners_thesis_seminar_id_fkey`(`thesis_seminar_id`),
    INDEX `thesis_seminar_examiners_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_seminar_examiners_assigned_by_fkey`(`assigned_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_examiner_assessment_details` (
    `thesis_seminar_examiner_id` VARCHAR(255) NOT NULL,
    `thesis_seminar_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_examiner_assessment_details_criteria_id_fkey`(`thesis_seminar_assessment_criteria_id`),
    PRIMARY KEY (`thesis_seminar_examiner_id`, `thesis_seminar_assessment_criteria_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_revisions` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_seminar_examiner_id` VARCHAR(255) NOT NULL,
    `approved_by` VARCHAR(255) NULL,
    `description` TEXT NOT NULL,
    `revision_action` TEXT NULL,
    `student_submitted_at` DATETIME(3) NULL,
    `supervisor_approved_at` DATETIME(3) NULL,

    INDEX `thesis_seminar_revisions_seminar_examiner_id_fkey`(`thesis_seminar_examiner_id`),
    INDEX `thesis_seminar_revisions_approved_by_fkey`(`approved_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defences` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NULL,
    `registered_at` DATETIME(3) NULL,
    `date` DATE NULL,
    `start_time` TIME(0) NULL,
    `end_time` TIME(0) NULL,
    `meeting_link` VARCHAR(255) NULL,
    `status` ENUM('registered', 'verified', 'examiner_assigned', 'scheduled', 'passed', 'passed_with_revision', 'failed', 'cancelled') NOT NULL DEFAULT 'registered',
    `examiner_average_score` DOUBLE NULL,
    `supervisor_score` DOUBLE NULL,
    `unavailable_reasons` TEXT NULL,
    `supervisor_notes` TEXT NULL,
    `supervisor_assessment_submitted_at` DATETIME(3) NULL,
    `final_score` DOUBLE NULL,
    `result_finalized_at` DATETIME(3) NULL,
    `result_finalized_by` VARCHAR(255) NULL,
    `revision_finalized_at` DATETIME(3) NULL,
    `revision_finalized_by` VARCHAR(255) NULL,
    `cancelled_reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defences_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_defences_room_id_fkey`(`room_id`),
    INDEX `thesis_defences_result_finalized_by_fkey`(`result_finalized_by`, `thesis_id`),
    INDEX `thesis_defences_finalized_by_fkey`(`revision_finalized_by`, `thesis_id`),
    UNIQUE INDEX `thesis_defences_id_thesis_id_key`(`id`, `thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_requirements` (
    `id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NOT NULL,
    `code` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_requirements_academic_year_id_fkey`(`academic_year_id`),
    UNIQUE INDEX `thesis_defence_requirements_academic_year_id_code_key`(`academic_year_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_requirement_documents` (
    `thesis_defence_id` VARCHAR(255) NOT NULL,
    `thesis_defence_requirement_id` VARCHAR(255) NOT NULL,
    `verified_by` VARCHAR(255) NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL,
    `status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
    `notes` TEXT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_requirement_documents_requirement_id_fkey`(`thesis_defence_requirement_id`),
    INDEX `thesis_defence_requirement_documents_verified_by_fkey`(`verified_by`),
    PRIMARY KEY (`thesis_defence_id`, `thesis_defence_requirement_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_documents` (
    `thesis_defence_id` VARCHAR(255) NOT NULL,
    `document_type_id` VARCHAR(255) NOT NULL,
    `document_id` VARCHAR(255) NOT NULL,
    `verified_by` VARCHAR(255) NULL,
    `submitted_at` DATETIME(3) NOT NULL,
    `status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
    `notes` TEXT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_documents_verified_by_fkey`(`verified_by`),
    INDEX `thesis_defence_documents_document_id_idx`(`document_id`),
    PRIMARY KEY (`thesis_defence_id`, `document_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_examiners` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_defence_id` VARCHAR(255) NOT NULL,
    `lecturer_id` VARCHAR(255) NOT NULL,
    `assigned_by` VARCHAR(255) NOT NULL,
    `order` INTEGER NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL,
    `availability_status` ENUM('pending', 'available', 'unavailable') NOT NULL DEFAULT 'pending',
    `unavailable_reasons` TEXT NULL,
    `responded_at` DATETIME(3) NULL,
    `assessment_score` INTEGER NULL,
    `assessment_submitted_at` DATETIME(3) NULL,
    `revision_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_examiners_thesis_defence_id_fkey`(`thesis_defence_id`),
    INDEX `thesis_defence_examiners_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_defence_examiners_assigned_by_fkey`(`assigned_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_examiner_assessment_details` (
    `thesis_defence_examiner_id` VARCHAR(255) NOT NULL,
    `thesis_defence_examiner_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_examiner_assessment_details_criteria_id_fkey`(`thesis_defence_examiner_assessment_criteria_id`),
    PRIMARY KEY (`thesis_defence_examiner_id`, `thesis_defence_examiner_assessment_criteria_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_supervisor_assessment_details` (
    `thesis_defence_id` VARCHAR(255) NOT NULL,
    `thesis_defence_supervisor_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_supervisor_assessment_details_criteria_id_fkey`(`thesis_defence_supervisor_assessment_criteria_id`),
    PRIMARY KEY (`thesis_defence_id`, `thesis_defence_supervisor_assessment_criteria_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_revisions` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_defence_examiner_id` VARCHAR(255) NOT NULL,
    `approved_by` VARCHAR(255) NULL,
    `description` TEXT NOT NULL,
    `revision_action` TEXT NULL,
    `student_submitted_at` DATETIME(3) NULL,
    `supervisor_approved_at` DATETIME(3) NULL,

    INDEX `thesis_defence_revisions_defence_examiner_id_fkey`(`thesis_defence_examiner_id`),
    INDEX `thesis_defence_revisions_approved_by_fkey`(`approved_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisiums` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NULL,
    `academic_year_id` VARCHAR(191) NULL,
    `decree_uploaded_by` VARCHAR(191) NULL,
    `decree_uploaded_at` DATETIME(3) NULL,
    `room_id` VARCHAR(191) NULL,
    `document_id` VARCHAR(191) NULL,
    `exit_survey_form_id` VARCHAR(191) NULL,
    `exit_survey_open_date` DATE NULL,
    `exit_survey_close_date` DATE NULL,
    `registration_open_date` DATE NULL,
    `registration_close_date` DATE NULL,
    `event_date` DATE NULL,
    `notes` TEXT NULL,
    `status` ENUM('draft', 'open', 'closed', 'in_review', 'finalized') NOT NULL DEFAULT 'draft',
    `decree_number` VARCHAR(255) NULL,
    `decree_issued_at` DATETIME(3) NULL,
    `appointed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisiums_academic_year_id_idx`(`academic_year_id`),
    INDEX `yudisiums_decree_uploaded_by_fkey`(`decree_uploaded_by`),
    INDEX `yudisiums_room_id_fkey`(`room_id`),
    INDEX `yudisiums_document_id_fkey`(`document_id`),
    INDEX `yudisiums_exit_survey_form_id_fkey`(`exit_survey_form_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_requirements` (
    `id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
    `order` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_requirement_items` (
    `id` VARCHAR(255) NOT NULL,
    `yudisium_requirement_id` VARCHAR(255) NOT NULL,
    `yudisium_id` VARCHAR(255) NOT NULL,
    `order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_requirement_items_yudisium_id_idx`(`yudisium_id`),
    INDEX `yudisium_requirement_items_yudisium_requirement_id_idx`(`yudisium_requirement_id`),
    UNIQUE INDEX `yudisium_requirement_items_id_yudisium_id_key`(`id`, `yudisium_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_participants` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `yudisium_id` VARCHAR(191) NOT NULL,
    `exit_survey_form_id` VARCHAR(255) NULL,
    `registered_at` DATETIME(3) NULL,
    `verified_at` DATETIME(3) NULL,
    `exit_survey_submitted_at` DATETIME(3) NULL,
    `status` ENUM('registered', 'under_review', 'approved', 'rejected', 'finalized') NOT NULL DEFAULT 'registered',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_participants_thesis_id_fkey`(`thesis_id`),
    INDEX `yudisium_participants_yudisium_id_fkey`(`yudisium_id`),
    INDEX `yudisium_participants_exit_survey_form_id_fkey`(`exit_survey_form_id`),
    UNIQUE INDEX `yudisium_participants_id_yudisium_id_key`(`id`, `yudisium_id`),
    UNIQUE INDEX `yudisium_participants_id_exit_survey_form_id_key`(`id`, `exit_survey_form_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_participant_requirements` (
    `yudisium_participant_id` VARCHAR(255) NOT NULL,
    `yudisium_requirement_item_id` VARCHAR(255) NOT NULL,
    `yudisium_id` VARCHAR(255) NOT NULL,
    `verified_by` VARCHAR(255) NULL,
    `document_id` VARCHAR(255) NULL,
    `file_path` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL,
    `status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
    `notes` TEXT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_participant_requirements_yudisium_requirement_id_fkey`(`yudisium_requirement_item_id`, `yudisium_id`),
    INDEX `yudisium_participant_requirements_verified_by_fkey`(`verified_by`),
    INDEX `yudisium_participant_requirements_document_id_fkey`(`document_id`),
    PRIMARY KEY (`yudisium_participant_id`, `yudisium_requirement_item_id`, `yudisium_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_cpl_reccomendations` (
    `id` VARCHAR(255) NOT NULL,
    `yudisium_participant_id` VARCHAR(255) NOT NULL,
    `cpl_id` VARCHAR(255) NOT NULL,
    `created_by` VARCHAR(255) NULL,
    `resolved_by` VARCHAR(255) NULL,
    `recommendation_document_id` VARCHAR(255) NULL,
    `settlement_document_id` VARCHAR(255) NULL,
    `reccomendation` TEXT NULL,
    `description` TEXT NULL,
    `status` ENUM('open', 'in_progress', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_cpl_reccomendations_participant_id_fkey`(`yudisium_participant_id`),
    INDEX `yudisium_cpl_reccomendations_cpl_id_fkey`(`cpl_id`),
    INDEX `yudisium_cpl_reccomendations_created_by_fkey`(`created_by`),
    INDEX `yudisium_cpl_reccomendations_resolved_by_fkey`(`resolved_by`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_exit_survey_responses` (
    `id` VARCHAR(255) NOT NULL,
    `yudisium_id` VARCHAR(255) NOT NULL,
    `thesis_id` VARCHAR(255) NOT NULL,
    `submitted_at` DATETIME(3) NOT NULL,

    INDEX `student_exit_survey_responses_yudisium_id_fkey`(`yudisium_id`),
    INDEX `student_exit_survey_responses_thesis_id_fkey`(`thesis_id`),
    UNIQUE INDEX `student_exit_survey_responses_yudisium_id_thesis_id_key`(`yudisium_id`, `thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_exit_survey_answers` (
    `id` VARCHAR(255) NOT NULL,
    `student_exit_survey_response_id` VARCHAR(255) NOT NULL,
    `exit_survey_question_id` VARCHAR(255) NOT NULL,
    `exit_survey_option_id` VARCHAR(255) NULL,
    `answer_text` TEXT NULL,
    `answer_date` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `student_exit_survey_answers_response_id_fkey`(`student_exit_survey_response_id`),
    INDEX `student_exit_survey_answers_question_id_fkey`(`exit_survey_question_id`),
    INDEX `student_exit_survey_answers_option_id_fkey`(`exit_survey_option_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_participant_exit_survey_answers` (
    `id` VARCHAR(255) NOT NULL,
    `yudisium_participant_id` VARCHAR(255) NOT NULL,
    `exit_survey_form_id` VARCHAR(255) NOT NULL,
    `exit_survey_question_id` VARCHAR(255) NOT NULL,
    `exit_survey_option_id` VARCHAR(255) NULL,
    `answer_text` TEXT NULL,
    `answer_date` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_participant_exit_survey_answers_participant_id_fkey`(`yudisium_participant_id`, `exit_survey_form_id`),
    INDEX `yudisium_participant_exit_survey_answers_question_id_fkey`(`exit_survey_question_id`, `exit_survey_form_id`),
    INDEX `yudisium_participant_exit_survey_answers_option_id_fkey`(`exit_survey_option_id`, `exit_survey_question_id`),
    UNIQUE INDEX `yudisium_participant_exit_survey_answers_yudisium_participan_key`(`yudisium_participant_id`, `exit_survey_question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `document_type_id` VARCHAR(191) NULL,
    `file_path` VARCHAR(191) NULL,
    `file_name` VARCHAR(191) NULL,
    `file_size` INTEGER NULL,
    `mime_type` VARCHAR(100) NULL,
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
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `type` VARCHAR(50) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `data` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_fkey`(`user_id`),
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
    `status` ENUM('PENDING', 'APPROVED_BY_SEKDEP', 'REJECTED_BY_SEKDEP', 'ACCEPTED_BY_COMPANY', 'PARTIALLY_ACCEPTED', 'REJECTED_BY_COMPANY', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
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
    `unit_section` VARCHAR(191) NULL,
    `actual_start_date` DATE NULL,
    `actual_end_date` DATE NULL,
    `status` ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'ACCEPTED_BY_COMPANY', 'REJECTED_BY_COMPANY', 'ONGOING', 'COMPLETED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING',
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
    `report_final_title` VARCHAR(191) NULL,
    `report_final_doc_id` VARCHAR(191) NULL,
    `report_final_status` ENUM('SUBMITTED', 'APPROVED', 'REVISION_NEEDED') NULL,
    `report_final_notes` TEXT NULL,
    `report_final_uploaded_at` DATETIME(3) NULL,
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
    INDEX `internships_report_final_doc_id_fkey`(`report_final_doc_id`),
    UNIQUE INDEX `internships_student_id_proposal_id_key`(`student_id`, `proposal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_logbooks` (
    `id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `activity_date` DATE NOT NULL,
    `activity_description` TEXT NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
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
    `lecturer_id` VARCHAR(191) NOT NULL,
    `week_number` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED') NOT NULL DEFAULT 'DRAFT',
    `submission_date` DATE NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_guidance_sessions_internship_id_fkey`(`internship_id`),
    INDEX `internship_guidance_sessions_lecturer_id_fkey`(`lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_student_answers` (
    `id` VARCHAR(191) NOT NULL,
    `guidance_session_id` VARCHAR(191) NOT NULL,
    `question_id` VARCHAR(191) NOT NULL,
    `answer_text` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_guidance_student_answers_session_id_fkey`(`guidance_session_id`),
    INDEX `internship_guidance_student_answers_question_id_fkey`(`question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_guidance_lecturer_answers` (
    `id` VARCHAR(191) NOT NULL,
    `guidance_session_id` VARCHAR(191) NOT NULL,
    `criteria_id` VARCHAR(191) NOT NULL,
    `evaluation_value` ENUM('SANGAT_BAIK', 'BAIK', 'CUKUP', 'PERLU_PERBAIKAN') NULL,
    `answer_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_guidance_lecturer_answers_session_id_fkey`(`guidance_session_id`),
    INDEX `internship_guidance_lecturer_answers_criteria_id_fkey`(`criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `internship_seminars` (
    `id` VARCHAR(191) NOT NULL,
    `internship_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `seminar_date` DATE NOT NULL,
    `start_time` TIME(0) NOT NULL,
    `end_time` TIME(0) NOT NULL,
    `moderator_student_id` VARCHAR(191) NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'REQUESTED',
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
    `id` VARCHAR(191) NOT NULL,
    `seminar_id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'VALIDATED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `validated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_seminar_audiences_seminar_id_fkey`(`seminar_id`),
    INDEX `internship_seminar_audiences_student_id_fkey`(`student_id`),
    PRIMARY KEY (`id`)
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
    `rubric_level_description` TEXT NOT NULL,
    `min_score` DOUBLE NOT NULL,
    `max_score` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `internship_assessment_rubrics_cpmk_id_fkey`(`cpmk_id`),
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
CREATE TABLE `thesis_advisor_request_draft` (
    `id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NULL,
    `topic_id` VARCHAR(191) NULL,
    `proposed_title` VARCHAR(255) NULL,
    `background_summary` TEXT NULL,
    `problem_statement` TEXT NULL,
    `proposed_solution` TEXT NULL,
    `research_object` VARCHAR(255) NULL,
    `research_permit_status` ENUM('approved', 'in_process', 'not_approved') NULL,
    `justification_text` TEXT NULL,
    `student_justification` TEXT NULL,
    `attachment_id` VARCHAR(191) NULL,
    `last_submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `thesis_advisor_request_draft_student_id_key`(`student_id`),
    INDEX `thesis_advisor_request_draft_lecturer_id_idx`(`lecturer_id`),
    INDEX `thesis_advisor_request_draft_topic_id_idx`(`topic_id`),
    INDEX `thesis_advisor_request_draft_attachment_id_idx`(`attachment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_advisor_request` (
    `id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `topic_id` VARCHAR(191) NULL,
    `thesis_id` VARCHAR(191) NULL,
    `proposed_title` VARCHAR(255) NULL,
    `background_summary` TEXT NULL,
    `problem_statement` TEXT NULL,
    `proposed_solution` TEXT NULL,
    `research_object` VARCHAR(255) NULL,
    `research_permit_status` ENUM('approved', 'in_process', 'not_approved') NULL,
    `justification_text` TEXT NULL,
    `student_justification` TEXT NULL,
    `request_type` ENUM('ta_01', 'ta_02') NOT NULL DEFAULT 'ta_01',
    `status` ENUM('pending', 'under_review', 'pending_kadep', 'booking_approved', 'active_official', 'released', 'revision_requested', 'rejected_by_dosen', 'rejected_by_kadep', 'redirected', 'withdrawn', 'canceled', 'closed', 'escalated', 'approved', 'rejected', 'override_approved', 'assigned') NOT NULL DEFAULT 'pending',
    `route_type` ENUM('normal', 'escalated', 'dept') NOT NULL DEFAULT 'normal',
    `lecturer_approval_note` TEXT NULL,
    `lecturer_overquota_reason` TEXT NULL,
    `rejection_reason` TEXT NULL,
    `reviewed_by` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `lecturer_responded_at` DATETIME(3) NULL,
    `withdrawn_at` DATETIME(3) NULL,
    `released_at` DATETIME(3) NULL,
    `release_reason` VARCHAR(64) NULL,
    `released_academic_year_id` VARCHAR(191) NULL,
    `withdraw_count` INTEGER NOT NULL DEFAULT 0,
    `redirected_to` VARCHAR(191) NULL,
    `kadep_notes` TEXT NULL,
    `attachment_id` VARCHAR(191) NULL,
    `forwarded_to_kadep_at` DATETIME(3) NULL,
    `forwarded_by_lecturer_id` VARCHAR(191) NULL,
    `accepted_over_normal` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_advisor_request_student_id_idx`(`student_id`),
    INDEX `thesis_advisor_request_student_id_status_idx`(`student_id`, `status`),
    INDEX `thesis_advisor_request_lecturer_id_idx`(`lecturer_id`),
    INDEX `thesis_advisor_request_lecturer_id_academic_year_id_status_idx`(`lecturer_id`, `academic_year_id`, `status`),
    INDEX `thesis_advisor_request_academic_year_id_status_idx`(`academic_year_id`, `status`),
    INDEX `thesis_advisor_request_thesis_id_idx`(`thesis_id`),
    INDEX `thesis_advisor_request_status_created_at_idx`(`status`, `created_at`),
    INDEX `thesis_advisor_request_status_idx`(`status`),
    INDEX `thesis_advisor_request_released_academic_year_id_idx`(`released_academic_year_id`),
    INDEX `thesis_advisor_request_reviewed_by_idx`(`reviewed_by`),
    INDEX `thesis_advisor_request_redirected_to_idx`(`redirected_to`),
    INDEX `thesis_advisor_request_forwarded_by_lecturer_id_idx`(`forwarded_by_lecturer_id`),
    INDEX `thesis_advisor_request_attachment_id_idx`(`attachment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_proposal_versions` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `description` TEXT NULL,
    `is_latest` BOOLEAN NOT NULL DEFAULT true,
    `submitted_as_final_at` DATETIME(3) NULL,
    `submitted_as_final_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_proposal_versions_document_id_idx`(`document_id`),
    INDEX `thesis_proposal_versions_thesis_id_is_latest_idx`(`thesis_id`, `is_latest`),
    INDEX `thesis_proposal_versions_submitted_as_final_at_idx`(`submitted_as_final_at`),
    INDEX `thesis_proposal_versions_submitted_as_final_by_user_id_idx`(`submitted_as_final_by_user_id`),
    UNIQUE INDEX `thesis_proposal_versions_thesis_id_version_key`(`thesis_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `research_method_scores` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `supervisor_id` VARCHAR(191) NULL,
    `supervisor_score` INTEGER NULL,
    `lecturer_id` VARCHAR(191) NULL,
    `lecturer_score` INTEGER NULL,
    `final_score` INTEGER NULL,
    `is_finalized` BOOLEAN NOT NULL DEFAULT false,
    `finalized_by` VARCHAR(191) NULL,
    `finalized_at` DATETIME(3) NULL,
    `calculated_at` DATETIME(3) NULL,
    `attendance_record_id` VARCHAR(191) NULL,
    `attendance_auto_zeroed_at` DATETIME(3) NULL,
    `attendance_auto_zero_reason` TEXT NULL,
    `co_signed_by_lecturer_id` VARCHAR(191) NULL,
    `co_signed_at` DATETIME(3) NULL,
    `co_sign_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `research_method_scores_thesis_id_key`(`thesis_id`),
    INDEX `research_method_scores_supervisor_id_idx`(`supervisor_id`),
    INDEX `research_method_scores_lecturer_id_idx`(`lecturer_id`),
    INDEX `research_method_scores_is_finalized_idx`(`is_finalized`),
    INDEX `research_method_scores_co_signed_by_lecturer_id_idx`(`co_signed_by_lecturer_id`),
    INDEX `research_method_scores_finalized_by_idx`(`finalized_by`),
    INDEX `research_method_scores_attendance_record_id_idx`(`attendance_record_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `research_method_score_details` (
    `research_method_score_id` VARCHAR(191) NOT NULL,
    `assessment_criteria_id` VARCHAR(191) NOT NULL,
    `assessment_rubric_id` VARCHAR(191) NULL,
    `score` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `research_method_score_details_criteria_id_fkey`(`assessment_criteria_id`),
    INDEX `research_method_score_details_rubric_id_fkey`(`assessment_rubric_id`),
    PRIMARY KEY (`research_method_score_id`, `assessment_criteria_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `metopen_attendance_imports` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `uploaded_by_user_id` VARCHAR(191) NOT NULL,
    `class_code` VARCHAR(100) NULL,
    `course_name` VARCHAR(255) NULL,
    `semester_label` VARCHAR(100) NULL,
    `filter_label` VARCHAR(100) NULL,
    `lecturer_names` JSON NULL,
    `source_files` JSON NULL,
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
    `id` VARCHAR(191) NOT NULL,
    `import_id` VARCHAR(191) NOT NULL,
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

    INDEX `metopen_attendance_records_identity_number_idx`(`identity_number`),
    INDEX `metopen_attendance_records_student_id_idx`(`student_id`),
    INDEX `metopen_attendance_records_is_eligible_idx`(`is_eligible`),
    UNIQUE INDEX `metopen_attendance_records_import_id_identity_number_key`(`import_id`, `identity_number`),
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
CREATE TABLE `supervision_quota_defaults` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `quota_max` INTEGER NOT NULL DEFAULT 10,
    `quota_soft_limit` INTEGER NOT NULL DEFAULT 8,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `supervision_quota_defaults_academic_year_id_key`(`academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lecturer_supervision_quotas` (
    `id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `quota_max` INTEGER NOT NULL DEFAULT 10,
    `quota_soft_limit` INTEGER NOT NULL DEFAULT 8,
    `current_count` INTEGER NOT NULL DEFAULT 0,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `lecturer_supervision_quotas_academic_year_id_idx`(`academic_year_id`),
    UNIQUE INDEX `lecturer_supervision_quotas_lecturer_id_academic_year_id_key`(`lecturer_id`, `academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `action` VARCHAR(50) NOT NULL,
    `entity` VARCHAR(100) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `changes` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_has_roles` ADD CONSTRAINT `user_has_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `user_roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_has_roles` ADD CONSTRAINT `user_has_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `students` ADD CONSTRAINT `students_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_cpl_id_fkey` FOREIGN KEY (`cpl_id`) REFERENCES `cpls`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_input_by_fkey` FOREIGN KEY (`input_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturers` ADD CONSTRAINT `lecturers_science_group_id_fkey` FOREIGN KEY (`science_group_id`) REFERENCES `science_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturers` ADD CONSTRAINT `lecturers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturer_availabilities` ADD CONSTRAINT `lecturer_availabilities_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_academic_year_snapshots` ADD CONSTRAINT `student_academic_year_snapshots_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_academic_year_snapshots` ADD CONSTRAINT `student_academic_year_snapshots_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpls` ADD CONSTRAINT `cpls_curriculum_id_fkey` FOREIGN KEY (`curriculum_id`) REFERENCES `curriculums`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpmks` ADD CONSTRAINT `cpmks_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpmks` ADD CONSTRAINT `cpmks_cpl_id_fkey` FOREIGN KEY (`cpl_id`) REFERENCES `cpls`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_cpmks` ADD CONSTRAINT `thesis_cpmks_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_assessment_criterias` ADD CONSTRAINT `thesis_seminar_assessment_criterias_thesis_cpmk_id_fkey` FOREIGN KEY (`thesis_cpmk_id`) REFERENCES `thesis_cpmks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_assessment_rubrics` ADD CONSTRAINT `thesis_seminar_assessment_rubrics_thesis_seminar_assessment_fkey` FOREIGN KEY (`thesis_seminar_assessment_criteria_id`) REFERENCES `thesis_seminar_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiner_assessment_criterias` ADD CONSTRAINT `thesis_defence_examiner_assessment_criterias_thesis_cpmk_id_fkey` FOREIGN KEY (`thesis_cpmk_id`) REFERENCES `thesis_cpmks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiner_assessment_rubrics` ADD CONSTRAINT `thesis_defence_examiner_assessment_rubrics_thesis_defence_e_fkey` FOREIGN KEY (`thesis_defence_examiner_assessment_criteria_id`) REFERENCES `thesis_defence_examiner_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_supervisor_assessment_criterias` ADD CONSTRAINT `thesis_defence_supervisor_assessment_criterias_thesis_cpmk__fkey` FOREIGN KEY (`thesis_cpmk_id`) REFERENCES `thesis_cpmks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_supervisor_assessment_rubrics` ADD CONSTRAINT `thesis_defence_supervisor_assessment_rubrics_thesis_defence_fkey` FOREIGN KEY (`thesis_defence_supervisor_assessment_criteria_id`) REFERENCES `thesis_defence_supervisor_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_criterias` ADD CONSTRAINT `assessment_criterias_cpmk_id_fkey` FOREIGN KEY (`cpmk_id`) REFERENCES `cpmks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_rubrics` ADD CONSTRAINT `assessment_rubrics_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_cpmks` ADD CONSTRAINT `metopen_cpmks_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_score_compositions` ADD CONSTRAINT `metopen_score_compositions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_assessment_criterias` ADD CONSTRAINT `metopen_assessment_criterias_metopen_cpmk_id_fkey` FOREIGN KEY (`metopen_cpmk_id`) REFERENCES `metopen_cpmks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_assessment_rubrics` ADD CONSTRAINT `metopen_assessment_rubrics_metopen_assessment_criteria_id_fkey` FOREIGN KEY (`metopen_assessment_criteria_id`) REFERENCES `metopen_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exit_survey_sessions` ADD CONSTRAINT `exit_survey_sessions_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exit_survey_questions` ADD CONSTRAINT `exit_survey_questions_exit_survey_session_id_exit_survey_fo_fkey` FOREIGN KEY (`exit_survey_session_id`, `exit_survey_form_id`) REFERENCES `exit_survey_sessions`(`id`, `exit_survey_form_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exit_survey_questions` ADD CONSTRAINT `exit_survey_questions_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exit_survey_options` ADD CONSTRAINT `exit_survey_options_exit_survey_question_id_fkey` FOREIGN KEY (`exit_survey_question_id`) REFERENCES `exit_survey_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_final_thesis_document_id_fkey` FOREIGN KEY (`final_thesis_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_proposal_document_id_fkey` FOREIGN KEY (`proposal_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_final_proposal_version_id_fkey` FOREIGN KEY (`final_proposal_version_id`) REFERENCES `thesis_proposal_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_title_approval_document_id_fkey` FOREIGN KEY (`title_approval_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_proposal_reviewed_by_user_id_fkey` FOREIGN KEY (`proposal_reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_ta04_assignment_issued_by_user_id_fkey` FOREIGN KEY (`ta04_assignment_issued_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_ta04_assignment_academic_year_id_fkey` FOREIGN KEY (`ta04_assignment_academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_active_academic_year_id_fkey` FOREIGN KEY (`active_academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_thesis_status_id_fkey` FOREIGN KEY (`thesis_status_id`) REFERENCES `thesis_status`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_thesis_topic_id_fkey` FOREIGN KEY (`thesis_topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batches` ADD CONSTRAINT `ta04_batches_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batches` ADD CONSTRAINT `ta04_batches_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batches` ADD CONSTRAINT `ta04_batches_generated_by_user_id_fkey` FOREIGN KEY (`generated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batch_members` ADD CONSTRAINT `ta04_batch_members_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `ta04_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batch_members` ADD CONSTRAINT `ta04_batch_members_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_student_informal_logs` ADD CONSTRAINT `thesis_student_informal_logs_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_student_informal_logs` ADD CONSTRAINT `thesis_student_informal_logs_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_student_informal_logs` ADD CONSTRAINT `thesis_student_informal_logs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_new_topic_id_fkey` FOREIGN KEY (`new_topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_new_supervisor_id_fkey` FOREIGN KEY (`new_supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_supporting_document_id_fkey` FOREIGN KEY (`supporting_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_replaced_supervisor_lecturer_id_fkey` FOREIGN KEY (`replaced_supervisor_lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_request_approvals` ADD CONSTRAINT `thesis_change_request_approvals_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_request_approvals` ADD CONSTRAINT `thesis_change_request_approvals_request_id_fkey` FOREIGN KEY (`request_id`) REFERENCES `thesis_change_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_supervisors` ADD CONSTRAINT `thesis_supervisors_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_supervisors` ADD CONSTRAINT `thesis_supervisors_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `user_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_supervisors` ADD CONSTRAINT `thesis_supervisors_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_evaluations` ADD CONSTRAINT `thesis_guidance_evaluations_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_evaluations` ADD CONSTRAINT `thesis_guidance_evaluations_thesis_supervisor_id_fkey` FOREIGN KEY (`thesis_supervisor_id`) REFERENCES `thesis_supervisors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_evaluations` ADD CONSTRAINT `thesis_guidance_evaluations_kadep_approved_by_fkey` FOREIGN KEY (`kadep_approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_topics` ADD CONSTRAINT `thesis_topics_science_group_id_fkey` FOREIGN KEY (`science_group_id`) REFERENCES `science_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_topics` ADD CONSTRAINT `thesis_topics_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_templates` ADD CONSTRAINT `thesis_milestone_templates_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestones` ADD CONSTRAINT `thesis_milestones_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestones` ADD CONSTRAINT `thesis_milestones_milestone_template_id_fkey` FOREIGN KEY (`milestone_template_id`) REFERENCES `thesis_milestone_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_milestones` ADD CONSTRAINT `thesis_guidance_milestones_guidance_id_fkey` FOREIGN KEY (`guidance_id`) REFERENCES `thesis_guidances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_milestones` ADD CONSTRAINT `thesis_guidance_milestones_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_template_criterias` ADD CONSTRAINT `milestone_template_criterias_milestone_template_id_fkey` FOREIGN KEY (`milestone_template_id`) REFERENCES `thesis_milestone_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_template_criterias` ADD CONSTRAINT `milestone_template_criterias_assessment_criteria_id_fkey` FOREIGN KEY (`assessment_criteria_id`) REFERENCES `assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_template_attachments` ADD CONSTRAINT `milestone_template_attachments_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `thesis_milestone_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `milestone_template_attachments` ADD CONSTRAINT `milestone_template_attachments_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_documents` ADD CONSTRAINT `thesis_milestone_documents_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_assessment_details` ADD CONSTRAINT `thesis_milestone_assessment_details_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_assessment_details` ADD CONSTRAINT `thesis_milestone_assessment_details_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_assessment_details` ADD CONSTRAINT `thesis_milestone_assessment_details_rubric_id_fkey` FOREIGN KEY (`rubric_id`) REFERENCES `assessment_rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidances` ADD CONSTRAINT `thesis_guidances_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidances` ADD CONSTRAINT `thesis_guidances_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidances` ADD CONSTRAINT `thesis_guidances_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminars` ADD CONSTRAINT `thesis_seminars_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminars` ADD CONSTRAINT `thesis_seminars_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminars` ADD CONSTRAINT `thesis_seminars_result_finalized_by_thesis_id_fkey` FOREIGN KEY (`result_finalized_by`, `thesis_id`) REFERENCES `thesis_supervisors`(`id`, `thesis_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminars` ADD CONSTRAINT `thesis_seminars_revision_finalized_by_thesis_id_fkey` FOREIGN KEY (`revision_finalized_by`, `thesis_id`) REFERENCES `thesis_supervisors`(`id`, `thesis_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_requirements` ADD CONSTRAINT `thesis_seminar_requirements_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_requirement_documents` ADD CONSTRAINT `thesis_seminar_requirement_documents_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_requirement_documents` ADD CONSTRAINT `thesis_seminar_requirement_documents_thesis_seminar_require_fkey` FOREIGN KEY (`thesis_seminar_requirement_id`) REFERENCES `thesis_seminar_requirements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_requirement_documents` ADD CONSTRAINT `thesis_seminar_requirement_documents_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_documents` ADD CONSTRAINT `thesis_seminar_documents_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_documents` ADD CONSTRAINT `thesis_seminar_documents_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_documents` ADD CONSTRAINT `thesis_seminar_documents_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_documents` ADD CONSTRAINT `thesis_seminar_documents_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_audiences` ADD CONSTRAINT `thesis_seminar_audiences_thesis_seminar_id_thesis_id_fkey` FOREIGN KEY (`thesis_seminar_id`, `thesis_id`) REFERENCES `thesis_seminars`(`id`, `thesis_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_audiences` ADD CONSTRAINT `thesis_seminar_audiences_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_audiences` ADD CONSTRAINT `thesis_seminar_audiences_approved_by_thesis_id_fkey` FOREIGN KEY (`approved_by`, `thesis_id`) REFERENCES `thesis_supervisors`(`id`, `thesis_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiners` ADD CONSTRAINT `thesis_seminar_examiners_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiners` ADD CONSTRAINT `thesis_seminar_examiners_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiners` ADD CONSTRAINT `thesis_seminar_examiners_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiner_assessment_details` ADD CONSTRAINT `thesis_seminar_examiner_assessment_details_thesis_seminar_e_fkey` FOREIGN KEY (`thesis_seminar_examiner_id`) REFERENCES `thesis_seminar_examiners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiner_assessment_details` ADD CONSTRAINT `thesis_seminar_examiner_assessment_details_thesis_seminar_a_fkey` FOREIGN KEY (`thesis_seminar_assessment_criteria_id`) REFERENCES `thesis_seminar_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_revisions` ADD CONSTRAINT `thesis_seminar_revisions_thesis_seminar_examiner_id_fkey` FOREIGN KEY (`thesis_seminar_examiner_id`) REFERENCES `thesis_seminar_examiners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_revisions` ADD CONSTRAINT `thesis_seminar_revisions_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `thesis_supervisors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defences` ADD CONSTRAINT `thesis_defences_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defences` ADD CONSTRAINT `thesis_defences_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defences` ADD CONSTRAINT `thesis_defences_result_finalized_by_thesis_id_fkey` FOREIGN KEY (`result_finalized_by`, `thesis_id`) REFERENCES `thesis_supervisors`(`id`, `thesis_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defences` ADD CONSTRAINT `thesis_defences_revision_finalized_by_thesis_id_fkey` FOREIGN KEY (`revision_finalized_by`, `thesis_id`) REFERENCES `thesis_supervisors`(`id`, `thesis_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_requirements` ADD CONSTRAINT `thesis_defence_requirements_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_requirement_documents` ADD CONSTRAINT `thesis_defence_requirement_documents_thesis_defence_id_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_requirement_documents` ADD CONSTRAINT `thesis_defence_requirement_documents_thesis_defence_require_fkey` FOREIGN KEY (`thesis_defence_requirement_id`) REFERENCES `thesis_defence_requirements`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_requirement_documents` ADD CONSTRAINT `thesis_defence_requirement_documents_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_documents` ADD CONSTRAINT `thesis_defence_documents_thesis_defence_id_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_documents` ADD CONSTRAINT `thesis_defence_documents_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_documents` ADD CONSTRAINT `thesis_defence_documents_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_documents` ADD CONSTRAINT `thesis_defence_documents_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiners` ADD CONSTRAINT `thesis_defence_examiners_thesis_defence_id_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiners` ADD CONSTRAINT `thesis_defence_examiners_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiners` ADD CONSTRAINT `thesis_defence_examiners_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiner_assessment_details` ADD CONSTRAINT `fk_tdea_details_examiner` FOREIGN KEY (`thesis_defence_examiner_id`) REFERENCES `thesis_defence_examiners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiner_assessment_details` ADD CONSTRAINT `fk_tdea_details_criteria` FOREIGN KEY (`thesis_defence_examiner_assessment_criteria_id`) REFERENCES `thesis_defence_examiner_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_supervisor_assessment_details` ADD CONSTRAINT `fk_tdsa_details_defence` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_supervisor_assessment_details` ADD CONSTRAINT `fk_tdsa_details_criteria` FOREIGN KEY (`thesis_defence_supervisor_assessment_criteria_id`) REFERENCES `thesis_defence_supervisor_assessment_criterias`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_revisions` ADD CONSTRAINT `thesis_defence_revisions_thesis_defence_examiner_id_fkey` FOREIGN KEY (`thesis_defence_examiner_id`) REFERENCES `thesis_defence_examiners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_revisions` ADD CONSTRAINT `thesis_defence_revisions_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `thesis_supervisors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_decree_uploaded_by_fkey` FOREIGN KEY (`decree_uploaded_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_requirement_items` ADD CONSTRAINT `yudisium_requirement_items_yudisium_id_fkey` FOREIGN KEY (`yudisium_id`) REFERENCES `yudisiums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_requirement_items` ADD CONSTRAINT `yudisium_requirement_items_yudisium_requirement_id_fkey` FOREIGN KEY (`yudisium_requirement_id`) REFERENCES `yudisium_requirements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participants` ADD CONSTRAINT `yudisium_participants_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participants` ADD CONSTRAINT `yudisium_participants_yudisium_id_fkey` FOREIGN KEY (`yudisium_id`) REFERENCES `yudisiums`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participants` ADD CONSTRAINT `yudisium_participants_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_yudisium_participant_id_y_fkey` FOREIGN KEY (`yudisium_participant_id`, `yudisium_id`) REFERENCES `yudisium_participants`(`id`, `yudisium_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_yudisium_requirement_item_fkey` FOREIGN KEY (`yudisium_requirement_item_id`, `yudisium_id`) REFERENCES `yudisium_requirement_items`(`id`, `yudisium_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_yudisium_participant_id_fkey` FOREIGN KEY (`yudisium_participant_id`) REFERENCES `yudisium_participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_cpl_id_fkey` FOREIGN KEY (`cpl_id`) REFERENCES `cpls`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_recommendation_document_id_fkey` FOREIGN KEY (`recommendation_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_cpl_reccomendations` ADD CONSTRAINT `yudisium_cpl_reccomendations_settlement_document_id_fkey` FOREIGN KEY (`settlement_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_exit_survey_responses` ADD CONSTRAINT `student_exit_survey_responses_yudisium_id_fkey` FOREIGN KEY (`yudisium_id`) REFERENCES `yudisiums`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_exit_survey_responses` ADD CONSTRAINT `student_exit_survey_responses_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_exit_survey_answers` ADD CONSTRAINT `student_exit_survey_answers_student_exit_survey_response_id_fkey` FOREIGN KEY (`student_exit_survey_response_id`) REFERENCES `student_exit_survey_responses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_exit_survey_answers` ADD CONSTRAINT `student_exit_survey_answers_exit_survey_question_id_fkey` FOREIGN KEY (`exit_survey_question_id`) REFERENCES `exit_survey_questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_exit_survey_answers` ADD CONSTRAINT `student_exit_survey_answers_exit_survey_option_id_fkey` FOREIGN KEY (`exit_survey_option_id`) REFERENCES `exit_survey_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_exit_survey_answers` ADD CONSTRAINT `yudisium_participant_exit_survey_answers_yudisium_participa_fkey` FOREIGN KEY (`yudisium_participant_id`, `exit_survey_form_id`) REFERENCES `yudisium_participants`(`id`, `exit_survey_form_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_exit_survey_answers` ADD CONSTRAINT `yudisium_participant_exit_survey_answers_exit_survey_questi_fkey` FOREIGN KEY (`exit_survey_question_id`, `exit_survey_form_id`) REFERENCES `exit_survey_questions`(`id`, `exit_survey_form_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_exit_survey_answers` ADD CONSTRAINT `yudisium_participant_exit_survey_answers_exit_survey_option_fkey` FOREIGN KEY (`exit_survey_option_id`, `exit_survey_question_id`) REFERENCES `exit_survey_options`(`id`, `exit_survey_question_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_document_type_id_fkey` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documents` ADD CONSTRAINT `documents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `internships` ADD CONSTRAINT `internships_report_final_doc_id_fkey` FOREIGN KEY (`report_final_doc_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `internship_guidance_sessions` ADD CONSTRAINT `internship_guidance_sessions_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `metopen_attendance_imports` ADD CONSTRAINT `metopen_attendance_imports_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_imports` ADD CONSTRAINT `metopen_attendance_imports_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_imports` ADD CONSTRAINT `metopen_attendance_imports_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_records` ADD CONSTRAINT `metopen_attendance_records_import_id_fkey` FOREIGN KEY (`import_id`) REFERENCES `metopen_attendance_imports`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `metopen_attendance_records` ADD CONSTRAINT `metopen_attendance_records_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `supervision_quota_defaults` ADD CONSTRAINT `supervision_quota_defaults_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturer_supervision_quotas` ADD CONSTRAINT `lecturer_supervision_quotas_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturer_supervision_quotas` ADD CONSTRAINT `lecturer_supervision_quotas_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;



-- ==========================================
-- STANDARD ROLES & ADMIN SEEDER
-- ==========================================
INSERT INTO `user_roles` (`id`, `name`) VALUES
  ('3a1ebec1-be17-45e4-903b-bcf21c7b37c1', 'Admin'),
  ('31017520-673c-45fd-a52e-8b4a89a06c62', 'Mahasiswa'),
  ('b46a4535-2323-4ca9-885a-8d8c948711b3', 'Pembimbing 1'),
  ('cdfc4fca-f3d1-4e1d-bb04-5961c15d1c13', 'Pembimbing 2'),
  ('bd09b50a-c2e9-4248-8a31-f296c0ef1233', 'Penguji'),
  ('71b5722f-41be-4063-ab9d-187437e2fb9b', 'Ketua Departemen'),
  ('09094723-ddfb-47f4-88e0-2ee8baf5311d', 'Sekretaris Departemen'),
  ('6d89fae2-7a4c-4a2c-880c-f0ba5e82af31', 'GKM'),
  ('k00rd000-0000-0000-0000-000000000001', 'Koordinator Matkul Metopen'),
  ('k00rd000-0000-0000-0000-000000000002', 'Koordinator Yudisium'),
  ('k00rd000-0000-0000-0000-000000000003', 'Tim Pengelola CPL');

INSERT INTO `users` (`id`, `full_name`, `identity_number`, `identity_type`, `email`, `password`, `isVerified`, `createdAt`, `updatedAt`)
VALUES ('60cc0c05-0b5b-4d16-83d1-3f2ce74a1b36', 'Admin DSI', 'ADMIN-001', 'OTHER', 'admin_si@fti.unand.ac.id', '$2b$10$S7Y54UfswFq30tbdu94QkOAEKGshUGf2cL1YmkOKyjKi5zCe6cuA2', true, NOW(), NOW());

INSERT INTO `user_has_roles` (`user_id`, `role_id`, `status`)
VALUES ('60cc0c05-0b5b-4d16-83d1-3f2ce74a1b36', '3a1ebec1-be17-45e4-903b-bcf21c7b37c1', 'active');

-- ==========================================
-- SCIENCE GROUPS & THESIS TOPICS SEEDER
-- ==========================================
INSERT INTO `science_groups` (`id`, `name`, `created_at`, `updated_at`) VALUES
  ('72535ef3-f622-42f0-940c-a29edf2e8e0b', 'Tata Kelola dan Infrastruktur Teknologi Informasi', NOW(), NOW()),
  ('0504c57b-cb2d-436c-baed-8f113a6efc7c', 'System Enterprise', NOW(), NOW()),
  ('9889d201-d6ff-44eb-b8f6-1de0a6ac866a', 'System Development', NOW(), NOW()),
  ('497529fc-8fd8-462c-b1e3-987ae916a317', 'Rekayasa Data dan Business Intelligent', NOW(), NOW());

INSERT INTO `thesis_topics` (`id`, `name`, `science_group_id`, `description`, `is_published`, `created_at`, `updated_at`) VALUES
  ('a3851181-ae63-448b-b58b-6ab004b9b9fc', 'Sistem Pendukung Keputusan', '497529fc-8fd8-462c-b1e3-987ae916a317', 'Topik Tugas Akhir: Sistem Pendukung Keputusan', true, NOW(), NOW()),
  ('39e5c8a1-76c2-43e3-9229-059b0bc3e08d', 'Bussines Intelligent', '497529fc-8fd8-462c-b1e3-987ae916a317', 'Topik Tugas Akhir: Bussines Intelligent', true, NOW(), NOW()),
  ('fd6d7d84-7d6c-4ce0-8629-8d04ceec05f5', 'Pengembangan Sistem', '9889d201-d6ff-44eb-b8f6-1de0a6ac866a', 'Topik Tugas Akhir: Pengembangan Sistem', true, NOW(), NOW()),
  ('8331404e-6505-4010-9b2e-99bc61671d2b', 'Machine Learning', '497529fc-8fd8-462c-b1e3-987ae916a317', 'Topik Tugas Akhir: Machine Learning', true, NOW(), NOW()),
  ('a8433765-b2a1-4b8b-9e6e-df79efab4d1b', 'Enterprise System', '0504c57b-cb2d-436c-baed-8f113a6efc7c', 'Topik Tugas Akhir: Enterprise System', true, NOW(), NOW());

-- ==========================================
-- THESIS STATUSES SEEDER
-- ==========================================
INSERT INTO `thesis_status` (`id`, `name`) VALUES
  ('cbaeb1b9-e625-471a-b8de-55af2a909a0e', 'Selesai'),
  ('44abd9c3-ed18-4716-8830-a88e81f73621', 'Gagal'),
  ('1556a0fe-16e9-4675-a8ba-88e78c073a61', 'Dibatalkan'),
  ('a82972a5-f5ee-4667-90ea-077cc5b4adc6', 'Bimbingan'),
  ('5e78f1ab-2f62-4eb7-a652-520d03f7834d', 'Diajukan'),
  ('f3260af7-e59b-4f53-98ea-4266daf69129', 'Lulus'),
  ('38525f6a-351b-4748-954b-3900040c0934', 'Drop Out'),
  ('edbfb97d-f167-46fe-b898-aa9adadb3687', 'Metopel');


