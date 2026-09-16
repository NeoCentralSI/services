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
    `gender` BOOLEAN NULL,
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
    `gpa` DOUBLE NULL,
    `graduation_predicate` VARCHAR(100) NULL,
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
CREATE TABLE `student_cpl_scores` (
    `student_id` VARCHAR(199) NOT NULL,
    `cpl_id` VARCHAR(255) NOT NULL,
    `input_by` VARCHAR(255) NULL,
    `validated_by` VARCHAR(255) NULL,
    `input_at` DATETIME(3) NULL,
    `score` DOUBLE NOT NULL,
    `old_cpl_score` DOUBLE NULL,
    `source` ENUM('SIA', 'manual') NOT NULL DEFAULT 'SIA',
    `status` ENUM('calculated', 'validated', 'finalized') NOT NULL DEFAULT 'calculated',
    `recommendation_document_path` VARCHAR(255) NULL,
    `recommendation_document_name` VARCHAR(255) NULL,
    `recommendation_document_mime_type` VARCHAR(255) NULL,
    `recommendation_document_size` INTEGER NULL,
    `settlement_document_path` VARCHAR(255) NULL,
    `settlement_document_name` VARCHAR(255) NULL,
    `settlement_document_mime_type` VARCHAR(255) NULL,
    `settlement_document_size` INTEGER NULL,
    `validated_at` DATETIME(3) NULL,
    `finalized_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `student_cpl_scores_cpl_id_fkey`(`cpl_id`),
    INDEX `student_cpl_scores_input_by_fkey`(`input_by`),
    INDEX `student_cpl_scores_validated_by_fkey`(`validated_by`),
    PRIMARY KEY (`student_id`, `cpl_id`)
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
    `year` VARCHAR(20) NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `thesis_seminar_minimum_score` DOUBLE NULL,
    `thesis_defence_minimum_score` DOUBLE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
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
CREATE TABLE `cpls` (
    `id` VARCHAR(191) NOT NULL,
    `curriculum_id` VARCHAR(255) NULL,
    `code` VARCHAR(255) NULL,
    `description` VARCHAR(255) NOT NULL,
    `minimal_score` INTEGER NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cpls_curriculum_id_code_version_key`(`curriculum_id`, `code`, `version`),
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
    `max_score` DOUBLE NOT NULL,
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
    `min_score` DOUBLE NOT NULL,
    `max_score` DOUBLE NOT NULL,
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
    `max_score` DOUBLE NOT NULL,
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
    `min_score` DOUBLE NOT NULL,
    `max_score` DOUBLE NOT NULL,
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
    `max_score` DOUBLE NOT NULL,
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
    `min_score` DOUBLE NOT NULL,
    `max_score` DOUBLE NOT NULL,
    `description` TEXT NOT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_tdsa_rubrics_criteria`(`thesis_defence_supervisor_assessment_criteria_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exit_survey_forms` (
    `id` VARCHAR(255) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
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
    `question_type` ENUM('short_answer', 'paragraph', 'single_choice', 'multiple_choice', 'date', 'number') NOT NULL,
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
    `rating` ENUM('ONGOING', 'SLOW', 'AT_RISK', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'ONGOING',
    `student_id` VARCHAR(191) NOT NULL,
    `thesis_topic_id` VARCHAR(191) NULL,
    `thesis_proposal_id` VARCHAR(191) NULL,
    `thesis_status_id` VARCHAR(191) NULL,
    `academic_year_id` VARCHAR(191) NULL,
    `document_id` VARCHAR(191) NULL,
    `title` TEXT NULL,
    `start_date` DATETIME(3) NULL,
    `deadline_date` DATETIME(3) NULL,
    `final_thesis_document_id` VARCHAR(191) NULL,
    `defence_requested_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_academic_year_id_fkey`(`academic_year_id`),
    INDEX `thesis_document_id_fkey`(`document_id`),
    INDEX `thesis_final_thesis_document_id_fkey`(`final_thesis_document_id`),
    INDEX `thesis_student_id_fkey`(`student_id`),
    INDEX `thesis_thesis_proposal_id_fkey`(`thesis_proposal_id`),
    INDEX `thesis_thesis_status_id_fkey`(`thesis_status_id`),
    INDEX `thesis_thesis_topic_id_fkey`(`thesis_topic_id`),
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
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_change_requests_reviewed_by_fkey`(`reviewed_by`),
    INDEX `thesis_change_requests_thesis_id_fkey`(`thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_change_request_approvals` (
    `id` VARCHAR(191) NOT NULL,
    `request_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_change_request_approvals_lecturer_id_fkey`(`lecturer_id`),
    UNIQUE INDEX `thesis_change_request_approvals_request_id_lecturer_id_key`(`request_id`, `lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_supervisors` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `lecturer_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `seminar_ready` BOOLEAN NOT NULL DEFAULT false,
    `defence_ready` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_participants_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_participants_role_id_fkey`(`role_id`),
    INDEX `thesis_participants_thesis_id_fkey`(`thesis_id`),
    UNIQUE INDEX `thesis_supervisors_id_thesis_id_key`(`id`, `thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_topics` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_status` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

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

    INDEX `thesis_proposal_document_id_fkey`(`document_id`),
    INDEX `thesis_proposal_student_id_fkey`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_milestone_templates` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `topic_id` VARCHAR(191) NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_milestone_templates_topic_id_fkey`(`topic_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_milestones` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `target_date` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `status` ENUM('not_started', 'in_progress', 'pending_review', 'revision_needed', 'completed', 'deleted') NOT NULL DEFAULT 'not_started',
    `progress_percentage` INTEGER NOT NULL DEFAULT 0,
    `validated_by` VARCHAR(191) NULL,
    `validated_at` DATETIME(3) NULL,
    `supervisor_notes` TEXT NULL,
    `student_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_milestones_thesis_id_order_index_idx`(`thesis_id`, `order_index`),
    INDEX `thesis_milestones_thesis_id_status_idx`(`thesis_id`, `status`),
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
    `status` ENUM('requested', 'accepted', 'rejected', 'summary_pending', 'completed', 'cancelled', 'deleted') NOT NULL DEFAULT 'requested',
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
    `verified_at` DATETIME(3) NULL,
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
    `scheduled_at` DATETIME(3) NULL,
    `invitation_letter_no` VARCHAR(255) NULL,
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
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_requirements_academic_year_id_fkey`(`academic_year_id`),
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
    `file_hash` VARCHAR(255) NULL,
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
    `assessment_score` DOUBLE NULL,
    `assessment_submitted_at` DATETIME(3) NULL,
    `revision_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_seminar_examiners_thesis_seminar_id_fkey`(`thesis_seminar_id`),
    INDEX `thesis_seminar_examiners_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_seminar_examiners_assigned_by_fkey`(`assigned_by`),
    UNIQUE INDEX `thesis_seminar_examiners_thesis_seminar_id_lecturer_id_key`(`thesis_seminar_id`, `lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_seminar_examiner_assessment_details` (
    `thesis_seminar_examiner_id` VARCHAR(255) NOT NULL,
    `thesis_seminar_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` DOUBLE NOT NULL,
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
    `verified_at` DATETIME(3) NULL,
    `date` DATE NULL,
    `start_time` TIME(0) NULL,
    `end_time` TIME(0) NULL,
    `meeting_link` VARCHAR(255) NULL,
    `status` ENUM('registered', 'verified', 'examiner_assigned', 'scheduled', 'passed', 'passed_with_revision', 'failed', 'cancelled') NOT NULL DEFAULT 'registered',
    `examiner_average_score` DOUBLE NULL,
    `supervisor_score` DOUBLE NULL,
    `supervisor_notes` TEXT NULL,
    `supervisor_assessment_submitted_at` DATETIME(3) NULL,
    `final_score` DOUBLE NULL,
    `grade` VARCHAR(10) NULL,
    `result_finalized_at` DATETIME(3) NULL,
    `result_finalized_by` VARCHAR(255) NULL,
    `revision_finalized_at` DATETIME(3) NULL,
    `revision_finalized_by` VARCHAR(255) NULL,
    `cancelled_reason` TEXT NULL,
    `scheduled_at` DATETIME(3) NULL,
    `invitation_letter_no` VARCHAR(255) NULL,
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
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_requirements_academic_year_id_fkey`(`academic_year_id`),
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
    `file_hash` VARCHAR(255) NULL,
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
    `assessment_score` DOUBLE NULL,
    `assessment_submitted_at` DATETIME(3) NULL,
    `revision_notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_examiners_thesis_defence_id_fkey`(`thesis_defence_id`),
    INDEX `thesis_defence_examiners_lecturer_id_fkey`(`lecturer_id`),
    INDEX `thesis_defence_examiners_assigned_by_fkey`(`assigned_by`),
    UNIQUE INDEX `thesis_defence_examiners_thesis_defence_id_lecturer_id_key`(`thesis_defence_id`, `lecturer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_examiner_assessment_details` (
    `thesis_defence_examiner_id` VARCHAR(255) NOT NULL,
    `thesis_defence_examiner_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` DOUBLE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_defence_examiner_assessment_details_criteria_id_fkey`(`thesis_defence_examiner_assessment_criteria_id`),
    PRIMARY KEY (`thesis_defence_examiner_id`, `thesis_defence_examiner_assessment_criteria_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_defence_supervisor_assessment_details` (
    `thesis_defence_id` VARCHAR(255) NOT NULL,
    `thesis_defence_supervisor_assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` DOUBLE NOT NULL,
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
    `name` VARCHAR(255) NOT NULL,
    `decree_uploaded_by` VARCHAR(191) NULL,
    `decree_uploaded_at` DATETIME(3) NULL,
    `room_id` VARCHAR(191) NULL,
    `decree_file_path` VARCHAR(255) NULL,
    `decree_file_name` VARCHAR(255) NULL,
    `decree_mime_type` VARCHAR(255) NULL,
    `decree_file_size` INTEGER NULL,
    `exit_survey_form_id` VARCHAR(191) NULL,
    `registration_open_date` DATETIME(3) NULL,
    `registration_close_date` DATETIME(3) NULL,
    `event_date` DATETIME(3) NULL,
    `appointed_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisiums_decree_uploaded_by_fkey`(`decree_uploaded_by`),
    INDEX `yudisiums_room_id_fkey`(`room_id`),
    INDEX `yudisiums_exit_survey_form_id_fkey`(`exit_survey_form_id`),
    UNIQUE INDEX `yudisiums_id_exit_survey_form_id_key`(`id`, `exit_survey_form_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_requirements` (
    `id` VARCHAR(255) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `is_public` BOOLEAN NOT NULL DEFAULT false,
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
    `exit_survey_form_id` VARCHAR(255) NOT NULL,
    `registered_at` DATETIME(3) NULL,
    `requirement_verified_at` DATETIME(3) NULL,
    `cpl_validated_at` DATETIME(3) NULL,
    `exit_survey_submitted_at` DATETIME(3) NULL,
    `status` ENUM('registered', 'eligible', 'appointed', 'rejected', 'finalized') NOT NULL DEFAULT 'registered',
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_participants_thesis_id_fkey`(`thesis_id`),
    INDEX `yudisium_participants_yudisium_id_fkey`(`yudisium_id`),
    INDEX `yudisium_participants_yudisium_form_id_fkey`(`yudisium_id`, `exit_survey_form_id`),
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
    `file_path` VARCHAR(255) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(255) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `file_hash` VARCHAR(255) NULL,
    `submitted_at` DATETIME(3) NOT NULL,
    `status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
    `notes` TEXT NULL,
    `verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_participant_requirements_yudisium_requirement_id_fkey`(`yudisium_requirement_item_id`, `yudisium_id`),
    INDEX `yudisium_participant_requirements_verified_by_fkey`(`verified_by`),
    PRIMARY KEY (`yudisium_participant_id`, `yudisium_requirement_item_id`, `yudisium_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `yudisium_participant_exit_survey_answers` (
    `yudisium_participant_id` VARCHAR(255) NOT NULL,
    `exit_survey_form_id` VARCHAR(255) NOT NULL,
    `exit_survey_question_id` VARCHAR(255) NOT NULL,
    `exit_survey_option_id` VARCHAR(255) NULL,
    `answer_text` TEXT NULL,
    `answer_number` DOUBLE NULL,
    `answer_date` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `yudisium_participant_exit_survey_answers_participant_id_fkey`(`yudisium_participant_id`, `exit_survey_form_id`),
    INDEX `yudisium_participant_exit_survey_answers_question_id_fkey`(`exit_survey_question_id`, `exit_survey_form_id`),
    INDEX `yudisium_participant_exit_survey_answers_option_id_fkey`(`exit_survey_option_id`, `exit_survey_question_id`),
    PRIMARY KEY (`yudisium_participant_id`, `exit_survey_form_id`, `exit_survey_question_id`)
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
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_fkey`(`user_id`),
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
CREATE TABLE `thesis_advisor_request` (
    `id` VARCHAR(255) NOT NULL,
    `student_id` VARCHAR(199) NOT NULL,
    `lecturer_id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NOT NULL,
    `topic_id` VARCHAR(255) NOT NULL,
    `priority` INTEGER NOT NULL,
    `proposed_title` VARCHAR(255) NULL,
    `background_summary` TEXT NULL,
    `justification_text` TEXT NULL,
    `status` ENUM('approved', 'pending', 'rejected') NOT NULL,
    `rejection_reason` VARCHAR(255) NULL,
    `reviewed_by` VARCHAR(255) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_supervision_decrees` (
    `id` VARCHAR(255) NOT NULL,
    `decree_number` VARCHAR(255) NOT NULL,
    `student_id` VARCHAR(255) NOT NULL,
    `academic_year_id` VARCHAR(255) NOT NULL,
    `supervisor_1_id` VARCHAR(255) NOT NULL,
    `supervisor_2_id` VARCHAR(255) NULL,
    `status` VARCHAR(255) NULL,
    `start_date` DATETIME(3) NULL,
    `end_date` DATETIME(3) NULL,
    `document_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_proposals` (
    `id` VARCHAR(255) NOT NULL,
    `student_id` VARCHAR(255) NULL,
    `decree_id` VARCHAR(255) NULL,
    `topic_id` VARCHAR(255) NULL,
    `document_id` VARCHAR(255) NULL,
    `title_final` VARCHAR(255) NULL,
    `methodology` VARCHAR(255) NULL,
    `research_object` VARCHAR(255) NULL,
    `tools` VARCHAR(255) NULL,
    `status` VARCHAR(255) NULL,
    `version` INTEGER NULL,
    `approved_by` VARCHAR(255) NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `thesis_proposals_decree_id_fkey`(`decree_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `thesis_proposal_histories` (
    `id` VARCHAR(255) NOT NULL,
    `proposal_id` VARCHAR(255) NULL,
    `previous_status` VARCHAR(255) NULL,
    `new_status` VARCHAR(255) NULL,
    `changed_by` VARCHAR(255) NULL,
    `comments` TEXT NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `thesis_proposal_histories_proposal_id_fkey`(`proposal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `research_method_scores` (
    `id` VARCHAR(255) NOT NULL,
    `proposal_id` VARCHAR(255) NULL,
    `supervisor_id` VARCHAR(255) NULL,
    `supervisor_score` INTEGER NULL,
    `lecturer_id` VARCHAR(255) NULL,
    `lecturer_score` INTEGER NULL,
    `final_score` INTEGER NULL,
    `is_passed` BOOLEAN NULL,
    `calculated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NULL,

    INDEX `research_method_scores_proposal_id_fkey`(`proposal_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `research_method_score_details` (
    `research_method_score_id` VARCHAR(255) NOT NULL,
    `assessment_criteria_id` VARCHAR(255) NOT NULL,
    `score` INTEGER NULL,

    INDEX `research_method_score_details_criteria_id_fkey`(`assessment_criteria_id`),
    PRIMARY KEY (`research_method_score_id`)
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
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_input_by_fkey` FOREIGN KEY (`input_by`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_cpl_scores` ADD CONSTRAINT `student_cpl_scores_validated_by_fkey` FOREIGN KEY (`validated_by`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturers` ADD CONSTRAINT `lecturers_science_group_id_fkey` FOREIGN KEY (`science_group_id`) REFERENCES `science_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lecturers` ADD CONSTRAINT `lecturers_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cpls` ADD CONSTRAINT `cpls_curriculum_id_fkey` FOREIGN KEY (`curriculum_id`) REFERENCES `curriculums`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_thesis_proposal_id_fkey` FOREIGN KEY (`thesis_proposal_id`) REFERENCES `thesis_proposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_thesis_status_id_fkey` FOREIGN KEY (`thesis_status_id`) REFERENCES `thesis_status`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_thesis_topic_id_fkey` FOREIGN KEY (`thesis_topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_change_requests` ADD CONSTRAINT `thesis_change_requests_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `thesis_proposal` ADD CONSTRAINT `thesis_proposal_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal` ADD CONSTRAINT `thesis_proposal_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestone_templates` ADD CONSTRAINT `thesis_milestone_templates_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_milestones` ADD CONSTRAINT `thesis_milestones_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_milestones` ADD CONSTRAINT `thesis_guidance_milestones_guidance_id_fkey` FOREIGN KEY (`guidance_id`) REFERENCES `thesis_guidances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_guidance_milestones` ADD CONSTRAINT `thesis_guidance_milestones_milestone_id_fkey` FOREIGN KEY (`milestone_id`) REFERENCES `thesis_milestones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `thesis_seminar_audiences` ADD CONSTRAINT `thesis_seminar_audiences_thesis_seminar_id_thesis_id_fkey` FOREIGN KEY (`thesis_seminar_id`, `thesis_id`) REFERENCES `thesis_seminars`(`id`, `thesis_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_audiences` ADD CONSTRAINT `thesis_seminar_audiences_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_audiences` ADD CONSTRAINT `thesis_seminar_audiences_approved_by_thesis_id_fkey` FOREIGN KEY (`approved_by`, `thesis_id`) REFERENCES `thesis_supervisors`(`id`, `thesis_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiners` ADD CONSTRAINT `thesis_seminar_examiners_thesis_seminar_id_fkey` FOREIGN KEY (`thesis_seminar_id`) REFERENCES `thesis_seminars`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiners` ADD CONSTRAINT `thesis_seminar_examiners_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_seminar_examiners` ADD CONSTRAINT `thesis_seminar_examiners_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `thesis_defence_examiners` ADD CONSTRAINT `thesis_defence_examiners_thesis_defence_id_fkey` FOREIGN KEY (`thesis_defence_id`) REFERENCES `thesis_defences`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiners` ADD CONSTRAINT `thesis_defence_examiners_lecturer_id_fkey` FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_defence_examiners` ADD CONSTRAINT `thesis_defence_examiners_assigned_by_fkey` FOREIGN KEY (`assigned_by`) REFERENCES `lecturers`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_decree_uploaded_by_fkey` FOREIGN KEY (`decree_uploaded_by`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisiums` ADD CONSTRAINT `yudisiums_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_requirement_items` ADD CONSTRAINT `yudisium_requirement_items_yudisium_id_fkey` FOREIGN KEY (`yudisium_id`) REFERENCES `yudisiums`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_requirement_items` ADD CONSTRAINT `yudisium_requirement_items_yudisium_requirement_id_fkey` FOREIGN KEY (`yudisium_requirement_id`) REFERENCES `yudisium_requirements`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participants` ADD CONSTRAINT `yudisium_participants_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participants` ADD CONSTRAINT `yudisium_participants_yudisium_id_exit_survey_form_id_fkey` FOREIGN KEY (`yudisium_id`, `exit_survey_form_id`) REFERENCES `yudisiums`(`id`, `exit_survey_form_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participants` ADD CONSTRAINT `yudisium_participants_exit_survey_form_id_fkey` FOREIGN KEY (`exit_survey_form_id`) REFERENCES `exit_survey_forms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_yudisium_participant_id_y_fkey` FOREIGN KEY (`yudisium_participant_id`, `yudisium_id`) REFERENCES `yudisium_participants`(`id`, `yudisium_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_yudisium_requirement_item_fkey` FOREIGN KEY (`yudisium_requirement_item_id`, `yudisium_id`) REFERENCES `yudisium_requirement_items`(`id`, `yudisium_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `yudisium_participant_requirements` ADD CONSTRAINT `yudisium_participant_requirements_verified_by_fkey` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `thesis_proposal_grades` ADD CONSTRAINT `thesis_proposal_grades_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `thesis_proposal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_grades` ADD CONSTRAINT `research_method_grades_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE `thesis_proposals` ADD CONSTRAINT `thesis_proposals_decree_id_fkey` FOREIGN KEY (`decree_id`) REFERENCES `thesis_supervision_decrees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_histories` ADD CONSTRAINT `thesis_proposal_histories_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `thesis_proposals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_proposal_id_fkey` FOREIGN KEY (`proposal_id`) REFERENCES `thesis_proposals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_score_details` ADD CONSTRAINT `research_method_score_details_research_method_score_id_fkey` FOREIGN KEY (`research_method_score_id`) REFERENCES `research_method_scores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
