CREATE TABLE IF NOT EXISTS `users` (
	`id` VARCHAR(191) NOT NULL,
	`full_name` VARCHAR(191) NOT NULL,
	`identity_number` VARCHAR(191) NOT NULL,
	`identity_type` ENUM('NIM', 'NIP', 'OTHER') NOT NULL,
	`email` VARCHAR(191) NOT NULL,
	`password` VARCHAR(191) NOT NULL,
	`phone_number` VARCHAR(191) NOT NULL,
	`isVerified` BOOLEAN NOT NULL DEFAULT false,
	`token` TEXT NOT NULL,
	`refresh_token` TEXT NOT NULL,
	`oauth_provider` VARCHAR(191) NOT NULL,
	`oauth_id` VARCHAR(191) NOT NULL,
	`oauth_access_token` TEXT NOT NULL,
	`oauth_refresh_token` TEXT NOT NULL,
	`createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `user_roles` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `user_has_roles` (
	`user_id` VARCHAR(191) NOT NULL,
	`role_id` VARCHAR(191) NOT NULL,
	`status` ENUM('active', 'nonActive') NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`)
);


CREATE TABLE IF NOT EXISTS `students` (
	`user_id` VARCHAR(191) NOT NULL,
	`student_status_id` VARCHAR(191) NOT NULL,
	`enrollment_year` INTEGER NOT NULL,
	`skscompleted` INTEGER NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`user_id`)
);


CREATE TABLE IF NOT EXISTS `student_status` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `lecturers` (
	`user_id` VARCHAR(191) NOT NULL,
	`science_group_id` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`user_id`)
);


CREATE TABLE IF NOT EXISTS `science_groups` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `academic_years` (
	`id` VARCHAR(191) NOT NULL,
	`semester` ENUM('ganjil', 'genap') NOT NULL DEFAULT 'ganjil',
	`year` INTEGER NOT NULL,
	`start_date` DATETIME NOT NULL,
	`end_date` DATETIME NOT NULL,
	`is_active` BOOLEAN NOT NULL DEFAULT false,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `rooms` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis` (
	`id` VARCHAR(191) NOT NULL,
	`rating` ENUM('ONGOING', 'SLOW', 'AT_RISK', 'FAILED') NOT NULL DEFAULT 'ONGOING',
	`student_id` VARCHAR(191) NOT NULL,
	`thesis_topic_id` VARCHAR(191) NOT NULL,
	`thesis_proposal_id` VARCHAR(191) NOT NULL,
	`thesis_status_id` VARCHAR(191) NOT NULL,
	`academic_year_id` VARCHAR(191) NOT NULL,
	`document_id` VARCHAR(191) NOT NULL,
	`title` VARCHAR(191) NOT NULL,
	`start_date` DATETIME NOT NULL,
	`deadline_date` DATETIME NOT NULL,
	`seminar_ready_approved_by_supervisor1` BOOLEAN NOT NULL DEFAULT false,
	`seminar_ready_approved_by_supervisor2` BOOLEAN NOT NULL DEFAULT false,
	`seminar_ready_approved_at` DATETIME NOT NULL,
	`seminar_ready_notes` TEXT NOT NULL,
	`defence_ready_approved_by_supervisor1` BOOLEAN NOT NULL DEFAULT false,
	`defence_ready_approved_by_supervisor2` BOOLEAN NOT NULL DEFAULT false,
	`defence_ready_approved_at` DATETIME NOT NULL,
	`defence_ready_notes` TEXT NOT NULL,
	`final_thesis_document_id` VARCHAR(191) NOT NULL,
	`defence_requested_at` DATETIME NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_change_requests` (
	`id` VARCHAR(191) NOT NULL,
	`student_id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`request_type` ENUM('topic', 'supervisor', 'both') NOT NULL,
	`reason` TEXT NOT NULL,
	`status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by` VARCHAR(191) NOT NULL,
	`review_notes` TEXT NOT NULL,
	`reviewed_at` DATETIME NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_change_request_approvals` (
	`id` VARCHAR(191) NOT NULL,
	`request_id` VARCHAR(191) NOT NULL,
	`lecturer_id` VARCHAR(191) NOT NULL,
	`status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
	`notes` TEXT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_participants` (
	`id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`lecturer_id` VARCHAR(191) NOT NULL,
	`role_id` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_topics` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_status` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_proposal` (
	`id` VARCHAR(191) NOT NULL,
	`student_id` VARCHAR(191) NOT NULL,
	`document_id` VARCHAR(191) NOT NULL,
	`status` ENUM('submitted', 'accepted', 'rejected') NOT NULL DEFAULT 'submitted',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_milestone_templates` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`description` TEXT NOT NULL,
	`topic_id` VARCHAR(191) NOT NULL,
	`order_index` INTEGER NOT NULL DEFAULT 0,
	`is_active` BOOLEAN NOT NULL DEFAULT true,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_milestones` (
	`id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`title` VARCHAR(191) NOT NULL,
	`description` TEXT NOT NULL,
	`order_index` INTEGER NOT NULL DEFAULT 0,
	`target_date` DATETIME NOT NULL,
	`started_at` DATETIME NOT NULL,
	`completed_at` DATETIME NOT NULL,
	`status` ENUM('not_started', 'in_progress', 'pending_review', 'revision_needed', 'completed') NOT NULL DEFAULT 'not_started',
	`progress_percentage` INTEGER NOT NULL DEFAULT 0,
	`validated_by` VARCHAR(191) NOT NULL,
	`validated_at` DATETIME NOT NULL,
	`supervisor_notes` TEXT NOT NULL,
	`evidence_url` VARCHAR(191) NOT NULL,
	`evidence_description` TEXT NOT NULL,
	`student_notes` TEXT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_guidances` (
	`id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`supervisor_id` VARCHAR(191) NOT NULL,
	`milestone_id` VARCHAR(191) NOT NULL,
	`milestone_ids` JSON NOT NULL,
	`requested_date` DATETIME NOT NULL,
	`approved_date` DATETIME NOT NULL,
	`duration` INTEGER NOT NULL DEFAULT 60,
	`document_url` VARCHAR(191) NOT NULL,
	`student_notes` TEXT NOT NULL,
	`supervisor_feedback` TEXT NOT NULL,
	`rejection_reason` TEXT NOT NULL,
	`session_summary` TEXT NOT NULL,
	`action_items` TEXT NOT NULL,
	`summary_submitted_at` DATETIME NOT NULL,
	`status` ENUM('requested', 'accepted', 'rejected', 'summary_pending', 'completed', 'cancelled') NOT NULL DEFAULT 'requested',
	`completed_at` DATETIME NOT NULL,
	`student_calendar_event_id` VARCHAR(191) NOT NULL,
	`supervisor_calendar_event_id` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_guidance_logs` (
	`id` VARCHAR(191) NOT NULL,
	`guidance_id` VARCHAR(191) NOT NULL,
	`topic` VARCHAR(191) NOT NULL,
	`discussion` TEXT NOT NULL,
	`action_items` TEXT NOT NULL,
	`attachment_url` VARCHAR(191) NOT NULL,
	`progress_notes` TEXT NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_seminars` (
	`id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`academic_year_id` VARCHAR(191) NOT NULL,
	`room_id` VARCHAR(191) NOT NULL,
	`registered_at` ENUM('scheduled', 'rescheduled', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
	`date` DATE NOT NULL,
	`start_time` TIME NOT NULL,
	`end_time` TIME NOT NULL,
	`meeting_link` VARCHAR(255),
	`status` ENUM('passed', 'need_revision', 'failed') NOT NULL DEFAULT 'passed',
	`final_score` INTEGER NOT NULL,
	`grade` VARCHAR(255) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_seminar_audiences` (
	`id` VARCHAR(191) NOT NULL,
	`seminar_id` VARCHAR(191) NOT NULL,
	`student_id` VARCHAR(191) NOT NULL,
	`validated_by` VARCHAR(191) NOT NULL,
	`validated_at` DATETIME NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_defences` (
	`id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`academic_year_id` VARCHAR(191) NOT NULL,
	`room_id` VARCHAR(191) NOT NULL,
	`registered_at` TIMESTAMP NOT NULL,
	`date` DATE NOT NULL,
	`start_time` TIME NOT NULL,
	`end_time` TIME NOT NULL,
	`meeting_link` VARCHAR(255),
	`status` ENUM('passed', 'need_revision', 'failed') NOT NULL DEFAULT 'passed',
	`examiner_average_score` INTEGER NOT NULL,
	`supervisor_score` INTEGER NOT NULL,
	`final_score` INTEGER NOT NULL,
	`grade` VARCHAR(255) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `yudisiums` (
	`id` VARCHAR(191) NOT NULL,
	`academic_year_id` VARCHAR(191) NOT NULL,
	`yudisium_period_id` VARCHAR(191) NOT NULL,
	`decree_uploaded_by` VARCHAR(255) NOT NULL,
	`document_id` VARCHAR(255) NOT NULL,
	`date` DATE NOT NULL,
	`start_time` TIME NOT NULL,
	`end_time` TIME NOT NULL,
	`decree_number` VARCHAR(255),
	`decree_issued_at` DATETIME,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `yudisium_participants` (
	`id` VARCHAR(191) NOT NULL,
	`yudisium_id` VARCHAR(191) NOT NULL,
	`thesis_id` VARCHAR(191) NOT NULL,
	`registered_at` TIMESTAMP NOT NULL,
	`status` ENUM('registered', 'appointed', 'cancelled') NOT NULL DEFAULT 'registered',
	`appointed_at` TIMESTAMP,
	`notes` VARCHAR(255),
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `documents` (
	`id` VARCHAR(191) NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`document_type_id` VARCHAR(191) NOT NULL,
	`file_path` VARCHAR(191) NOT NULL,
	`file_name` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `document_types` (
	`id` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `notifications` (
	`id` VARCHAR(191) NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`title` VARCHAR(191) NOT NULL,
	`message` VARCHAR(191) NOT NULL,
	`is_read` BOOLEAN NOT NULL DEFAULT false,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_proposal_grades` (
	`id` VARCHAR(191) NOT NULL,
	`proposal_id` VARCHAR(191) NOT NULL,
	`grade` INTEGER NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `research_method_grades` (
	`id` VARCHAR(191) NOT NULL,
	`student_id` VARCHAR(191) NOT NULL,
	`grade` INTEGER NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `companies` (
	`id` VARCHAR(191) NOT NULL,
	`company_name` VARCHAR(191) NOT NULL,
	`company_address` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internships` (
	`id` VARCHAR(191) NOT NULL,
	`student_id` VARCHAR(191) NOT NULL,
	`company_id` VARCHAR(191) NOT NULL,
	`field_supervisor` VARCHAR(191) NOT NULL,
	`field_supervisor_phone` VARCHAR(191) NOT NULL,
	`start_date` DATETIME NOT NULL,
	`end_date` DATETIME NOT NULL,
	`status` ENUM('ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'ongoing',
	`academic_year_id` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`lecturer_id` VARCHAR(191) NOT NULL,
	`seminar_booking_room_id` VARCHAR(191) NOT NULL,
	`seminar_booking_requested_by` VARCHAR(191) NOT NULL,
	`seminar_booking_approved_by` VARCHAR(191) NOT NULL,
	`seminar_booking_status` ENUM('requested', 'approved', 'cancelled', 'completed') NOT NULL DEFAULT 'requested',
	`seminar_booking_requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`seminar_booking_approved_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internship_reports` (
	`id` VARCHAR(191) NOT NULL,
	`internship_id` VARCHAR(191) NOT NULL,
	`entry_date` DATETIME NOT NULL,
	`activity_description` VARCHAR(191) NOT NULL,
	`validated_by_supervisor` BOOLEAN NOT NULL DEFAULT false,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internship_assessments` (
	`id` VARCHAR(191) NOT NULL,
	`internship_id` VARCHAR(191) NOT NULL,
	`score` DOUBLE NOT NULL,
	`comments` VARCHAR(191) NOT NULL,
	`type` ENUM('FIELD', 'LECTURER') NOT NULL,
	`raw_image_document_id` VARCHAR(191) NOT NULL,
	`ocr_text` VARCHAR(191) NOT NULL,
	`status` ENUM('pending', 'verified') NOT NULL DEFAULT 'pending',
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internship_seminars` (
	`id` VARCHAR(191) NOT NULL,
	`internship_id` VARCHAR(191) NOT NULL,
	`room_id` VARCHAR(191) NOT NULL,
	`start_time` DATETIME NOT NULL,
	`end_time` DATETIME NOT NULL,
	`status` ENUM('scheduled', 'rescheduled', 'ongoing', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
	`is_passed` BOOLEAN NOT NULL,
	`grade` DOUBLE NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internship_approvals` (
	`id` VARCHAR(191) NOT NULL,
	`internship_id` VARCHAR(191) NOT NULL,
	`document_id` VARCHAR(191) NOT NULL,
	`document_number` VARCHAR(191) NOT NULL,
	`approved_by` VARCHAR(191) NOT NULL,
	`role_id` VARCHAR(191) NOT NULL,
	`status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
	`notes` VARCHAR(191) NOT NULL,
	`approved_at` DATETIME NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internship_guidance_schedules` (
	`id` VARCHAR(191) NOT NULL,
	`internship_id` VARCHAR(191) NOT NULL,
	`lecturer_id` VARCHAR(191) NOT NULL,
	`session_number` INTEGER NOT NULL,
	`status` ENUM('requested', 'approved', 'completed', 'cancelled') NOT NULL DEFAULT 'requested',
	`topic` VARCHAR(191) NOT NULL,
	`current_progress` TEXT NOT NULL,
	`problems_encountered` TEXT NOT NULL,
	`discussion_summary` TEXT NOT NULL,
	`action_items` TEXT NOT NULL,
	`lecturer_feedback` VARCHAR(191) NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `internship_seminar_audiences` (
	`id` VARCHAR(191) NOT NULL,
	`seminar_id` VARCHAR(191) NOT NULL,
	`user_id` VARCHAR(191) NOT NULL,
	`validated_by` VARCHAR(191) NOT NULL,
	`validated_at` DATETIME NOT NULL,
	`created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` DATETIME NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `cpls` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`code` VARCHAR(255),
	`description` VARCHAR(255) NOT NULL,
	`min_scrore` INTEGER NOT NULL,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `student_cpl_scores` (
	`student_id` VARCHAR(199) NOT NULL,
	`cpl_id` VARCHAR(255) NOT NULL,
	`score` INTEGER NOT NULL,
	`status` ENUM('passed', 'failed') NOT NULL DEFAULT 'passed',
	`source` ENUM('SIA_API', 'MANUAL') NOT NULL DEFAULT 'SIA_API',
	`input_by` VARCHAR(255),
	`input_at` TIMESTAMP,
	PRIMARY KEY(`student_id`, `cpl_id`)
);


CREATE TABLE IF NOT EXISTS `cpmks` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`code` VARCHAR(255) NOT NULL,
	`description` VARCHAR(255) NOT NULL,
	`proposal_weight` INTEGER,
	`seminar_weight` INTEGER,
	`defence_weight` INTEGER,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `assessment_criterias` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`cpmk_id` VARCHAR(255) NOT NULL,
	`code` VARCHAR(255) NOT NULL,
	`name` VARCHAR(255) NOT NULL,
	`applies_to` ENUM('seminar', 'defence', 'proposal') NOT NULL,
	`max_weight` INTEGER NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `assesment_rubrics` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`assesment_criteria_id` VARCHAR(255) NOT NULL,
	`code` VARCHAR(255) NOT NULL,
	`description` VARCHAR(255) NOT NULL,
	`max_weight` INTEGER NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_advisor_request` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`student_id` VARCHAR(199) NOT NULL,
	`lecturer_id` VARCHAR(255) NOT NULL,
	`academic_year_id` VARCHAR(255) NOT NULL,
	`topic_id` VARCHAR(255) NOT NULL,
	`priority` INTEGER NOT NULL,
	`proposed_title` VARCHAR(255),
	`background_summary` TEXT(65535),
	`justification_text` TEXT(65535),
	`status` ENUM('approved', 'pending', 'rejected') NOT NULL,
	`rejection_reason` VARCHAR(255),
	`reviewed_by` VARCHAR(255),
	`reviewed_at` TIMESTAMP,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_supervision_decrees` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`decree_number` VARCHAR(255) NOT NULL,
	`student_id` VARCHAR(255) NOT NULL,
	`academic_year_id` VARCHAR(255) NOT NULL,
	`supervisor_1_id` VARCHAR(255) NOT NULL,
	`supervisor_2_id` VARCHAR(255),
	`status` ENUM(),
	`start_date` DATETIME,
	`end_date` DATETIME,
	`document_id` VARCHAR(255),
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_proposals` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`student_id` VARCHAR(255),
	`decree_id` VARCHAR(255),
	`topic_id` VARCHAR(255),
	`document_id` VARCHAR(255),
	`title_final` VARCHAR(255),
	`methodology` VARCHAR(255),
	`research_object` VARCHAR(255),
	`tools` VARCHAR(255),
	`status` ENUM(),
	`version` INTEGER,
	`approved_by` VARCHAR(255),
	`approved_at` TIMESTAMP,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_proposal_histories` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`proposal_id` VARCHAR(255),
	`previous_status` VARCHAR(255),
	`new_status` VARCHAR(255),
	`changed_by` VARCHAR(255),
	`comments` TEXT(65535),
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `research_method_scores` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`proposal_id` VARCHAR(255),
	`supervisor_id` VARCHAR(255),
	`supervisor_score` INTEGER,
	`lecturer_id` VARCHAR(255),
	`lecturer_score` INTEGER,
	`final_score` INTEGER,
	`is_passed` BOOLEAN,
	`calculated_at` TIMESTAMP,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `research_method_score_details` (
	`research_method_score_id` VARCHAR(255) NOT NULL UNIQUE,
	`rubric_id` VARCHAR(255) NOT NULL,
	`score` INTEGER,
	PRIMARY KEY(`research_method_score_id`)
);


CREATE TABLE IF NOT EXISTS `thesis_seminar_examiners` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`seminar_id` VARCHAR(255) NOT NULL,
	`lecturer_id` VARCHAR(255) NOT NULL,
	`assigned_by` VARCHAR(255) NOT NULL,
	`examiner_order` INTEGER NOT NULL,
	`assigned_at` TIMESTAMP NOT NULL,
	`availability_status` ENUM('pending', 'available', 'unavailable') NOT NULL DEFAULT 'pending',
	`responded_at` TIMESTAMP NOT NULL,
	`seminar_assessment_score` INTEGER,
	`seminar_assessment_submitted_at` TIMESTAMP,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_seminar_assessment_details` (
	`seminar_examiner_id` VARCHAR(255) NOT NULL UNIQUE,
	`rubric_id` VARCHAR(255) NOT NULL,
	`score` INTEGER NOT NULL,
	PRIMARY KEY(`seminar_examiner_id`, `rubric_id`)
);


CREATE TABLE IF NOT EXISTS `thesis_defence_examiners` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`defence_id` VARCHAR(255) NOT NULL,
	`lecturer_id` VARCHAR(255) NOT NULL,
	`assigned_by` VARCHAR(255) NOT NULL,
	`examiner_order` INTEGER NOT NULL,
	`assigned_at` TIMESTAMP NOT NULL,
	`source` ENUM('seminar', 'replacement') NOT NULL DEFAULT 'seminar',
	`availability_status` ENUM('pending', 'available', 'unavailable') NOT NULL DEFAULT 'pending',
	`responded_at` TIMESTAMP NOT NULL,
	`defence_assessment_score` INTEGER,
	`defence_assessment_submitted_at` TIMESTAMP,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_defence_examiner_assessment_details` (
	`defence_examiner_id` VARCHAR(255) NOT NULL UNIQUE,
	`rubric_id` VARCHAR(255) NOT NULL,
	`score` INTEGER NOT NULL,
	PRIMARY KEY(`defence_examiner_id`, `rubric_id`)
);


CREATE TABLE IF NOT EXISTS `thesis_defence_supervisor_assessment_details` (
	`defence_id` VARCHAR(255) NOT NULL UNIQUE,
	`rubric_id` VARCHAR(255) NOT NULL,
	`score` INTEGER NOT NULL,
	PRIMARY KEY(`defence_id`, `rubric_id`)
);


CREATE TABLE IF NOT EXISTS `lecturer_availabilities` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`lecturer_id` VARCHAR(255) NOT NULL,
	`academic_year_id` VARCHAR(255) NOT NULL,
	`week_day` VARCHAR(255) NOT NULL,
	`start_time` TIME NOT NULL,
	`end_time` TIME NOT NULL,
	`valid_from` DATE NOT NULL,
	`valid_until` DATE NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `seminar_attendance_requirements` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`academic_year_id` VARCHAR(255) NOT NULL,
	`minimum_attendance` INTEGER NOT NULL,
	`is_active` BOOLEAN NOT NULL,
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `yudisium_periods` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`name` VARCHAR(255) NOT NULL,
	`created_at` TIMESTAMP,
	`updated_at` VARCHAR(255),
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `yudisium_requirements` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`name` VARCHAR(255) NOT NULL,
	`is_active` BOOLEAN NOT NULL,
	`notes` VARCHAR(255),
	`created_at` TIMESTAMP,
	`updated_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `yudisium_participant_requirements` (
	`yudisium_participant_id` VARCHAR(255) NOT NULL UNIQUE,
	`yudisium_requirement_id` VARCHAR(255) NOT NULL,
	`document_id` VARCHAR(255) NOT NULL,
	`submitted_at` TIMESTAMP NOT NULL,
	`status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
	`approved_at` TIMESTAMP,
	`notes` VARCHAR(255),
	PRIMARY KEY(`yudisium_participant_id`, `yudisium_requirement_id`)
);


CREATE TABLE IF NOT EXISTS `thesis_seminar_documents` (
	`thesis_seminar_id` VARCHAR(255) NOT NULL UNIQUE,
	`document_type_id` VARCHAR(255) NOT NULL,
	`document_id` VARCHAR(255) NOT NULL,
	`submitted_at` TIMESTAMP NOT NULL,
	`status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
	`approved_at` TIMESTAMP,
	`notes` VARCHAR(255),
	PRIMARY KEY(`thesis_seminar_id`, `document_type_id`)
);


CREATE TABLE IF NOT EXISTS `thesis_defence_documents` (
	`thesis_defence_id` VARCHAR(255) NOT NULL UNIQUE,
	`document_type_id` VARCHAR(255) NOT NULL,
	`document_id` VARCHAR(255) NOT NULL,
	`submitted_at` TIMESTAMP NOT NULL,
	`status` ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
	`approved_at` TIMESTAMP,
	`notes` VARCHAR(255),
	PRIMARY KEY(`thesis_defence_id`, `document_type_id`)
);


CREATE TABLE IF NOT EXISTS `thesis_seminar_revisions` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`seminar_examiner_id` VARCHAR(255) NOT NULL,
	`description` VARCHAR(255) NOT NULL,
	`status` ENUM('pending', 'revised', 'approved') NOT NULL DEFAULT 'pending',
	`student_submitted_at` TIMESTAMP NOT NULL,
	`examiner_verified_at` TIMESTAMP,
	`supervisor_verified_at` TIMESTAMP NOT NULL,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `thesis_defence_revisions` (
	`id` INTEGER NOT NULL AUTO_INCREMENT UNIQUE,
	`defence` VARCHAR(255) NOT NULL,
	`description` VARCHAR(255) NOT NULL,
	`status` ENUM('pending', 'revised', 'approved') NOT NULL DEFAULT 'pending',
	`student_submitted_at` TIMESTAMP NOT NULL,
	`examiner_verified_at` TIMESTAMP,
	`supervisor_verified_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


CREATE TABLE IF NOT EXISTS `yudisium_cpl_reccomendations` (
	`id` VARCHAR(255) NOT NULL UNIQUE,
	`yudisium_participant_id` VARCHAR(255) NOT NULL,
	`cpl_id` VARCHAR(255) NOT NULL,
	`reccomendation_type` ENUM('development', 'additional_assesment', 'improvement') NOT NULL DEFAULT 'development',
	`description` VARCHAR(255) NOT NULL,
	`status` ENUM('draft', 'submitted', 'approved', 'declined', 'resolved') NOT NULL DEFAULT 'draft',
	`resolved_at` TIMESTAMP,
	PRIMARY KEY(`id`)
);


ALTER TABLE `user_has_roles`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `user_has_roles`
ADD FOREIGN KEY(`role_id`) REFERENCES `user_roles`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `students`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `students`
ADD FOREIGN KEY(`student_status_id`) REFERENCES `student_status`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`science_group_id`) REFERENCES `science_groups`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`user_id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`thesis_topic_id`) REFERENCES `thesis_topics`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`thesis_proposal_id`) REFERENCES `thesis_proposal`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`thesis_status_id`) REFERENCES `thesis_status`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`academic_year_id`) REFERENCES `academic_years`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`document_id`) REFERENCES `documents`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`final_thesis_document_id`) REFERENCES `documents`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_change_requests`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`user_id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_change_requests`
ADD FOREIGN KEY(`thesis_id`) REFERENCES `thesis`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_change_requests`
ADD FOREIGN KEY(`reviewed_by`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_change_request_approvals`
ADD FOREIGN KEY(`request_id`) REFERENCES `thesis_change_requests`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `thesis_change_request_approvals`
ADD FOREIGN KEY(`lecturer_id`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_participants`
ADD FOREIGN KEY(`thesis_id`) REFERENCES `thesis`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_participants`
ADD FOREIGN KEY(`lecturer_id`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_participants`
ADD FOREIGN KEY(`role_id`) REFERENCES `user_roles`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_proposal`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`user_id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_proposal`
ADD FOREIGN KEY(`document_id`) REFERENCES `documents`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_milestone_templates`
ADD FOREIGN KEY(`topic_id`) REFERENCES `thesis_topics`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_milestones`
ADD FOREIGN KEY(`thesis_id`) REFERENCES `thesis`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `thesis_guidances`
ADD FOREIGN KEY(`thesis_id`) REFERENCES `thesis`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_guidances`
ADD FOREIGN KEY(`supervisor_id`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_guidances`
ADD FOREIGN KEY(`milestone_id`) REFERENCES `thesis_milestones`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `thesis_guidance_logs`
ADD FOREIGN KEY(`guidance_id`) REFERENCES `thesis_guidances`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `thesis_seminars`
ADD FOREIGN KEY(`thesis_id`) REFERENCES `thesis`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_seminar_audiences`
ADD FOREIGN KEY(`seminar_id`) REFERENCES `thesis_seminars`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_defences`
ADD FOREIGN KEY(`thesis_id`) REFERENCES `thesis`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `yudisium_participants`
ADD FOREIGN KEY(`yudisium_id`) REFERENCES `yudisiums`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `documents`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `documents`
ADD FOREIGN KEY(`document_type_id`) REFERENCES `document_types`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `notifications`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `thesis_proposal_grades`
ADD FOREIGN KEY(`proposal_id`) REFERENCES `thesis_proposal`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `research_method_grades`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`user_id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internships`
ADD FOREIGN KEY(`student_id`) REFERENCES `students`(`user_id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internships`
ADD FOREIGN KEY(`company_id`) REFERENCES `companies`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internships`
ADD FOREIGN KEY(`academic_year_id`) REFERENCES `academic_years`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internships`
ADD FOREIGN KEY(`lecturer_id`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internships`
ADD FOREIGN KEY(`seminar_booking_room_id`) REFERENCES `rooms`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internships`
ADD FOREIGN KEY(`seminar_booking_requested_by`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internships`
ADD FOREIGN KEY(`seminar_booking_approved_by`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internship_reports`
ADD FOREIGN KEY(`internship_id`) REFERENCES `internships`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internship_assessments`
ADD FOREIGN KEY(`internship_id`) REFERENCES `internships`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internship_assessments`
ADD FOREIGN KEY(`raw_image_document_id`) REFERENCES `documents`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internship_seminars`
ADD FOREIGN KEY(`internship_id`) REFERENCES `internships`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internship_seminars`
ADD FOREIGN KEY(`room_id`) REFERENCES `rooms`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internship_approvals`
ADD FOREIGN KEY(`internship_id`) REFERENCES `internships`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internship_approvals`
ADD FOREIGN KEY(`document_id`) REFERENCES `documents`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internship_approvals`
ADD FOREIGN KEY(`approved_by`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internship_approvals`
ADD FOREIGN KEY(`role_id`) REFERENCES `user_roles`(`id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `internship_guidance_schedules`
ADD FOREIGN KEY(`internship_id`) REFERENCES `internships`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internship_guidance_schedules`
ADD FOREIGN KEY(`lecturer_id`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `internship_seminar_audiences`
ADD FOREIGN KEY(`seminar_id`) REFERENCES `internship_seminars`(`id`)
ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE `internship_seminar_audiences`
ADD FOREIGN KEY(`user_id`) REFERENCES `users`(`id`)
ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE `internship_seminar_audiences`
ADD FOREIGN KEY(`validated_by`) REFERENCES `lecturers`(`user_id`)
ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE `cpls`
ADD FOREIGN KEY(`code`) REFERENCES `cpls`(`description`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `cpls`
ADD FOREIGN KEY(`id`) REFERENCES `student_cpl_scores`(`cpl_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `students`
ADD FOREIGN KEY(`user_id`) REFERENCES `student_cpl_scores`(`student_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `cpmks`
ADD FOREIGN KEY(`id`) REFERENCES `assessment_criterias`(`cpmk_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `assessment_criterias`
ADD FOREIGN KEY(`id`) REFERENCES `assesment_rubrics`(`assesment_criteria_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `students`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_advisor_request`(`student_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_advisor_request`(`lecturer_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_advisor_request`(`reviewed_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `academic_years`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_advisor_request`(`academic_year_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_topics`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_advisor_request`(`topic_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `students`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_supervision_decrees`(`student_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `academic_years`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_supervision_decrees`(`academic_year_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_supervision_decrees`(`supervisor_1_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_supervision_decrees`(`supervisor_2_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `documents`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_supervision_decrees`(`document_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `students`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_proposals`(`student_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_proposals`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_proposal_histories`(`proposal_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_topics`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_proposals`(`topic_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `documents`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_proposals`(`document_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_proposals`(`approved_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_supervision_decrees`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_proposals`(`decree_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_proposal_histories`(`changed_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `research_method_scores`
ADD FOREIGN KEY(`id`) REFERENCES `research_method_score_details`(`research_method_score_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `assesment_rubrics`
ADD FOREIGN KEY(`id`) REFERENCES `research_method_score_details`(`rubric_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_proposals`
ADD FOREIGN KEY(`id`) REFERENCES `research_method_scores`(`proposal_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `research_method_scores`(`supervisor_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `research_method_scores`(`lecturer_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `rooms`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminars`(`room_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `academic_years`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminars`(`academic_year_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_participants`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_audiences`(`validated_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `students`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_seminar_audiences`(`student_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_seminars`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_examiners`(`seminar_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `thesis_seminar_examiners`(`lecturer_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `users`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_examiners`(`assigned_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `assesment_rubrics`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_assessment_details`(`rubric_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_seminar_examiners`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_assessment_details`(`seminar_examiner_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_defences`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_examiners`(`defence_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_defence_examiners`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_examiner_assessment_details`(`defence_examiner_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `assesment_rubrics`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_examiner_assessment_details`(`rubric_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_defences`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_supervisor_assessment_details`(`defence_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `assesment_rubrics`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_supervisor_assessment_details`(`rubric_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `academic_years`
ADD FOREIGN KEY(`id`) REFERENCES `lecturer_availabilities`(`academic_year_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `lecturers`
ADD FOREIGN KEY(`user_id`) REFERENCES `lecturer_availabilities`(`lecturer_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `academic_years`
ADD FOREIGN KEY(`id`) REFERENCES `seminar_attendance_requirements`(`academic_year_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `yudisium_periods`
ADD FOREIGN KEY(`id`) REFERENCES `yudisiums`(`yudisium_period_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `academic_years`
ADD FOREIGN KEY(`id`) REFERENCES `yudisiums`(`academic_year_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis`
ADD FOREIGN KEY(`id`) REFERENCES `yudisium_participants`(`thesis_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `yudisium_participants`
ADD FOREIGN KEY(`id`) REFERENCES `yudisium_participant_requirements`(`yudisium_participant_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `yudisium_requirements`
ADD FOREIGN KEY(`id`) REFERENCES `yudisium_participant_requirements`(`yudisium_requirement_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_defences`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_documents`(`thesis_defence_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_seminars`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_documents`(`thesis_seminar_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `documents`
ADD FOREIGN KEY(`id`) REFERENCES `yudisium_participant_requirements`(`document_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `document_types`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_documents`(`document_type_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `document_types`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_documents`(`document_type_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `documents`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_documents`(`document_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `documents`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_documents`(`document_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_seminar_examiners`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_seminar_revisions`(`seminar_examiner_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `thesis_defence_examiners`
ADD FOREIGN KEY(`id`) REFERENCES `thesis_defence_revisions`(`defence`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `yudisium_participants`
ADD FOREIGN KEY(`id`) REFERENCES `yudisium_cpl_reccomendations`(`yudisium_participant_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `users`
ADD FOREIGN KEY(`id`) REFERENCES `student_cpl_scores`(`input_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `cpls`
ADD FOREIGN KEY(`id`) REFERENCES `yudisium_cpl_reccomendations`(`cpl_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `users`
ADD FOREIGN KEY(`id`) REFERENCES `yudisiums`(`decree_uploaded_by`)
ON UPDATE NO ACTION ON DELETE NO ACTION;
ALTER TABLE `documents`
ADD FOREIGN KEY(`id`) REFERENCES `yudisiums`(`document_id`)
ON UPDATE NO ACTION ON DELETE NO ACTION;