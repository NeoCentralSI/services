-- Every Metopen CPMK/rubric catalog belongs to exactly one academic period.
-- Legacy global rows are assigned to the single operational period; ambiguous
-- or duplicate data intentionally makes the following constraints fail closed.
UPDATE `metopen_cpmks` AS `cpmk`
JOIN `academic_years` AS `academic_year`
  ON `academic_year`.`active_key` = 'ACTIVE'
SET `cpmk`.`academic_year_id` = `academic_year`.`id`
WHERE `cpmk`.`academic_year_id` IS NULL;

ALTER TABLE `metopen_cpmks`
  DROP FOREIGN KEY `metopen_cpmks_academic_year_id_fkey`;

ALTER TABLE `metopen_cpmks`
  MODIFY `academic_year_id` VARCHAR(191) NOT NULL;

ALTER TABLE `metopen_cpmks`
  ADD CONSTRAINT `metopen_cpmks_academic_year_id_fkey`
    FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX `metopen_cpmks_period_code_key`
  ON `metopen_cpmks`(`academic_year_id`, `code`);
