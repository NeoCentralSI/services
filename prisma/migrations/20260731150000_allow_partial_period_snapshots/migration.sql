-- Eligibility Metopen and KRS Tugas Akhir may arrive independently. Keep each
-- value NULL until its first authoritative boolean snapshot instead of
-- guessing NULL=false. Lifecycle consumers must fail closed on NULL KRS.
ALTER TABLE `student_academic_year_snapshots`
  MODIFY `eligible_metopen` BOOLEAN NULL,
  MODIFY `research_method_completed` BOOLEAN NULL,
  MODIFY `taking_thesis_course` BOOLEAN NULL,
  MODIFY `source` ENUM('sia', 'devtools') NULL,
  ADD COLUMN `eligibility_source` ENUM('sia', 'devtools') NULL,
  ADD COLUMN `eligibility_captured_at` DATETIME(3) NULL,
  ADD COLUMN `thesis_course_source` ENUM('sia', 'devtools') NULL,
  ADD COLUMN `thesis_course_captured_at` DATETIME(3) NULL;

UPDATE `student_academic_year_snapshots`
SET
  `eligibility_source` =
    CASE WHEN `eligible_metopen` IS NOT NULL THEN `source` ELSE NULL END,
  `eligibility_captured_at` =
    CASE WHEN `eligible_metopen` IS NOT NULL THEN `captured_at` ELSE NULL END,
  `thesis_course_source` =
    CASE WHEN `taking_thesis_course` IS NOT NULL THEN `source` ELSE NULL END,
  `thesis_course_captured_at` =
    CASE WHEN `taking_thesis_course` IS NOT NULL THEN `captured_at` ELSE NULL END;
