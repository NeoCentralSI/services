-- AlterEnum: add 'under_review' to ThesisAdvisorRequestStatus
ALTER TABLE `thesis_advisor_request`
  MODIFY COLUMN `status` ENUM(
    'pending',
    'under_review',
    'escalated',
    'approved',
    'rejected',
    'override_approved',
    'redirected',
    'withdrawn',
    'assigned'
  ) NOT NULL DEFAULT 'pending';

-- AlterTable: add withdraw_count column
ALTER TABLE `thesis_advisor_request`
  ADD COLUMN `withdraw_count` INT NOT NULL DEFAULT 0;
