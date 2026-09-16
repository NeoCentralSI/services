-- Redefinisi TA-04 awal + promosi beban aktif otomatis.
-- TA-04 diterbitkan setelah booking TA-01/TA-02 disetujui, sementara beban
-- aktif dipromosikan otomatis setelah TA-03 final dan snapshot KRS TA.

-- ============================================================
-- ALTER ENUMS
-- ============================================================
ALTER TABLE `thesis_advisor_request`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'under_review',
    'pending_kadep',
    'booking_approved',
    'active_official',
    'released',
    'revision_requested',
    'rejected_by_dosen',
    'rejected_by_kadep',
    'redirected',
    'withdrawn',
    'canceled',
    'closed',
    'escalated',
    'approved',
    'rejected',
    'override_approved',
    'assigned'
  ) NOT NULL DEFAULT 'pending';

ALTER TABLE `thesis_supervisors`
  MODIFY COLUMN `status` ENUM('active', 'terminated', 'released') NOT NULL DEFAULT 'active';

-- ============================================================
-- THESIS: TA-04 assignment snapshot + active promotion metadata
-- ============================================================
ALTER TABLE `thesis`
  ADD COLUMN `ta04_assignment_issued_at` DATETIME(3) NULL,
  ADD COLUMN `ta04_assignment_issued_by_user_id` VARCHAR(255) NULL,
  ADD COLUMN `ta04_assignment_title` TEXT NULL,
  ADD COLUMN `ta04_assignment_supervisor_names` TEXT NULL,
  ADD COLUMN `ta04_assignment_academic_year_id` VARCHAR(191) NULL,
  ADD COLUMN `active_academic_year_id` VARCHAR(191) NULL,
  ADD COLUMN `active_promoted_at` DATETIME(3) NULL;

CREATE INDEX `thesis_ta04_assignment_issued_by_user_id_fkey`
  ON `thesis`(`ta04_assignment_issued_by_user_id`);

CREATE INDEX `thesis_ta04_assignment_academic_year_id_fkey`
  ON `thesis`(`ta04_assignment_academic_year_id`);

CREATE INDEX `thesis_active_academic_year_id_fkey`
  ON `thesis`(`active_academic_year_id`);

ALTER TABLE `thesis`
  ADD CONSTRAINT `thesis_ta04_assignment_issued_by_user_id_fkey`
    FOREIGN KEY (`ta04_assignment_issued_by_user_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `thesis_ta04_assignment_academic_year_id_fkey`
    FOREIGN KEY (`ta04_assignment_academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `thesis_active_academic_year_id_fkey`
    FOREIGN KEY (`active_academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: data lama yang sudah accepted dianggap sudah dipromosikan aktif.
UPDATE `thesis`
SET
  `active_academic_year_id` = COALESCE(`active_academic_year_id`, `academic_year_id`),
  `active_promoted_at` = COALESCE(`active_promoted_at`, `proposal_reviewed_at`, `updated_at`),
  `ta04_assignment_issued_at` = COALESCE(`ta04_assignment_issued_at`, `proposal_reviewed_at`, `updated_at`),
  `ta04_assignment_issued_by_user_id` = COALESCE(`ta04_assignment_issued_by_user_id`, `proposal_reviewed_by_user_id`),
  `ta04_assignment_title` = COALESCE(`ta04_assignment_title`, `title`),
  `ta04_assignment_academic_year_id` = COALESCE(`ta04_assignment_academic_year_id`, `academic_year_id`)
WHERE `proposal_status` = 'accepted';

-- ============================================================
-- REQUEST: release audit
-- ============================================================
ALTER TABLE `thesis_advisor_request`
  ADD COLUMN `released_at` DATETIME(3) NULL,
  ADD COLUMN `release_reason` VARCHAR(64) NULL,
  ADD COLUMN `released_academic_year_id` VARCHAR(255) NULL;

CREATE INDEX `thesis_advisor_request_released_academic_year_id_idx`
  ON `thesis_advisor_request`(`released_academic_year_id`);

ALTER TABLE `thesis_advisor_request`
  ADD CONSTRAINT `thesis_advisor_request_released_academic_year_id_fkey`
    FOREIGN KEY (`released_academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
