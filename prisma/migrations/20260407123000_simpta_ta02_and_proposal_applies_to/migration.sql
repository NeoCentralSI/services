-- SIMPTA alignment:
-- 1. Store TA-02 structured fields on thesis_advisor_request
-- 2. Backfill research-method assessment criteria from applies_to='metopen' to applies_to='proposal'

ALTER TABLE `thesis_advisor_request`
  ADD COLUMN `problem_statement` LONGTEXT NULL,
  ADD COLUMN `proposed_solution` LONGTEXT NULL,
  ADD COLUMN `research_object` VARCHAR(255) NULL,
  ADD COLUMN `research_permit_status` ENUM('approved', 'in_process', 'not_approved') NULL;

UPDATE `assessment_criterias` ac
INNER JOIN `cpmks` c ON c.`id` = ac.`cpmk_id`
SET ac.`applies_to` = 'proposal'
WHERE ac.`applies_to` = 'metopen'
  AND c.`type` = 'research_method';
