-- Add denormalized academic year reference to metopen class enrollments.
-- Keep duplicate rows intact for now; unique(student_id, academic_year_id)
-- must only be added after admin audit and cleanup.

ALTER TABLE `metopen_class_students`
  ADD COLUMN `academic_year_id` VARCHAR(191) NULL AFTER `student_id`;

UPDATE `metopen_class_students` AS `mcs`
INNER JOIN `metopen_classes` AS `mc`
  ON `mc`.`id` = `mcs`.`class_id`
SET `mcs`.`academic_year_id` = `mc`.`academic_year_id`
WHERE `mcs`.`academic_year_id` IS NULL;

ALTER TABLE `metopen_class_students`
  MODIFY `academic_year_id` VARCHAR(191) NOT NULL;

ALTER TABLE `metopen_class_students`
  ADD INDEX `metopen_class_students_academic_year_id_student_id_idx` (`academic_year_id`, `student_id`);

ALTER TABLE `metopen_class_students`
  ADD CONSTRAINT `metopen_class_students_academic_year_id_fkey`
    FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
