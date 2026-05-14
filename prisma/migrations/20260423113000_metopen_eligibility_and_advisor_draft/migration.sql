ALTER TABLE `students`
  ADD COLUMN `eligible_metopen` TINYINT(1) NULL AFTER `current_semester`,
  ADD COLUMN `metopen_eligibility_source` ENUM('sia','devtools') NULL AFTER `eligible_metopen`,
  ADD COLUMN `metopen_eligibility_updated_at` DATETIME(3) NULL AFTER `metopen_eligibility_source`;

ALTER TABLE `thesis_advisor_request`
  ADD COLUMN `request_type` ENUM('ta_01','ta_02') NOT NULL DEFAULT 'ta_01' AFTER `justification_text`,
  MODIFY COLUMN `status` ENUM(
    'pending',
    'under_review',
    'pending_kadep',
    'booking_approved',
    'active_official',
    'revision_requested',
    'rejected_by_dosen',
    'rejected_by_kadep',
    'canceled',
    'closed',
    'escalated',
    'approved',
    'rejected',
    'override_approved',
    'redirected',
    'withdrawn',
    'assigned'
  ) NOT NULL DEFAULT 'pending';

UPDATE `thesis_advisor_request`
SET `request_type` = CASE
  WHEN `lecturer_id` IS NULL THEN 'ta_02'
  ELSE 'ta_01'
END;

CREATE TABLE `thesis_advisor_request_draft` (
  `id` VARCHAR(255) NOT NULL,
  `student_id` VARCHAR(199) NOT NULL,
  `lecturer_id` VARCHAR(255) NULL,
  `topic_id` VARCHAR(255) NULL,
  `proposed_title` VARCHAR(255) NULL,
  `background_summary` TEXT NULL,
  `problem_statement` TEXT NULL,
  `proposed_solution` TEXT NULL,
  `research_object` VARCHAR(255) NULL,
  `research_permit_status` ENUM('approved','in_process','not_approved') NULL,
  `justification_text` TEXT NULL,
  `attachment_id` VARCHAR(255) NULL,
  `last_submitted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `thesis_advisor_request_draft_student_id_key` (`student_id`),
  KEY `thesis_advisor_request_draft_lecturer_id_idx` (`lecturer_id`),
  KEY `thesis_advisor_request_draft_topic_id_idx` (`topic_id`),
  KEY `thesis_advisor_request_draft_attachment_id_idx` (`attachment_id`),
  CONSTRAINT `thesis_advisor_request_draft_student_id_fkey`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`user_id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_draft_lecturer_id_fkey`
    FOREIGN KEY (`lecturer_id`) REFERENCES `lecturers` (`user_id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_draft_topic_id_fkey`
    FOREIGN KEY (`topic_id`) REFERENCES `thesis_topics` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `thesis_advisor_request_draft_attachment_id_fkey`
    FOREIGN KEY (`attachment_id`) REFERENCES `documents` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
