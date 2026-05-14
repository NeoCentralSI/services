ALTER TABLE `thesis_advisor_request_draft`
  ADD COLUMN `student_justification` TEXT NULL AFTER `justification_text`;

UPDATE `thesis_advisor_request_draft`
SET `student_justification` = `justification_text`
WHERE `student_justification` IS NULL
  AND `justification_text` IS NOT NULL;

ALTER TABLE `thesis_advisor_request`
  ADD COLUMN `student_justification` TEXT NULL AFTER `justification_text`,
  ADD COLUMN `lecturer_overquota_reason` TEXT NULL AFTER `lecturer_approval_note`;

UPDATE `thesis_advisor_request`
SET `student_justification` = `justification_text`
WHERE `student_justification` IS NULL
  AND `justification_text` IS NOT NULL;

UPDATE `thesis_advisor_request`
SET `lecturer_overquota_reason` = `lecturer_approval_note`
WHERE `lecturer_overquota_reason` IS NULL
  AND `lecturer_approval_note` IS NOT NULL
  AND `route_type` = 'escalated';
