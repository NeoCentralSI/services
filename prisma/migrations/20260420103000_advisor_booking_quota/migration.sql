-- SIMPTA advisor quota split:
-- 1. extend thesis_advisor_request lifecycle for booking/pending_kadep/active_official
-- 2. store lecturer approval note for overquota accept reason
-- 3. add supporting indexes for quota snapshot queries

ALTER TABLE `thesis_advisor_request`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'under_review',
    'pending_kadep',
    'booking_approved',
    'active_official',
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
  ) NOT NULL DEFAULT 'pending',
  ADD COLUMN `lecturer_approval_note` LONGTEXT NULL AFTER `route_type`;

CREATE INDEX `thesis_advisor_request_student_id_status_idx`
  ON `thesis_advisor_request` (`student_id`, `status`);

CREATE INDEX `thesis_advisor_request_lecturer_ay_status_idx`
  ON `thesis_advisor_request` (`lecturer_id`, `academic_year_id`, `status`);
