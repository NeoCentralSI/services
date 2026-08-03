-- Backfill only authoritative legacy observations whose own source timestamp
-- falls inside one unambiguous academic-period window. Never infer NULL=false.
INSERT INTO `student_academic_year_snapshots` (
  `id`,
  `student_id`,
  `academic_year_id`,
  `eligible_metopen`,
  `research_method_completed`,
  `taking_thesis_course`,
  `eligibility_source`,
  `eligibility_captured_at`,
  `thesis_course_source`,
  `thesis_course_captured_at`,
  `source`,
  `captured_at`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `student`.`user_id`,
  `academic_year`.`id`,
  `student`.`eligible_metopen`,
  `student`.`research_method_completed`,
  NULL,
  `student`.`metopen_eligibility_source`,
  `student`.`metopen_eligibility_updated_at`,
  NULL,
  NULL,
  `student`.`metopen_eligibility_source`,
  `student`.`metopen_eligibility_updated_at`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `students` AS `student`
JOIN `academic_years` AS `academic_year`
  ON `student`.`metopen_eligibility_updated_at`
    BETWEEN `academic_year`.`start_date` AND `academic_year`.`end_date`
WHERE `student`.`eligible_metopen` IS NOT NULL
  AND `student`.`metopen_eligibility_source` IS NOT NULL
  AND `student`.`metopen_eligibility_updated_at` IS NOT NULL
ON DUPLICATE KEY UPDATE
  `eligible_metopen` =
    COALESCE(`student_academic_year_snapshots`.`eligible_metopen`, VALUES(`eligible_metopen`)),
  `research_method_completed` =
    COALESCE(
      `student_academic_year_snapshots`.`research_method_completed`,
      VALUES(`research_method_completed`)
    ),
  `eligibility_source` =
    COALESCE(`student_academic_year_snapshots`.`eligibility_source`, VALUES(`eligibility_source`)),
  `eligibility_captured_at` =
    COALESCE(
      `student_academic_year_snapshots`.`eligibility_captured_at`,
      VALUES(`eligibility_captured_at`)
    );

INSERT INTO `student_academic_year_snapshots` (
  `id`,
  `student_id`,
  `academic_year_id`,
  `eligible_metopen`,
  `research_method_completed`,
  `taking_thesis_course`,
  `eligibility_source`,
  `eligibility_captured_at`,
  `thesis_course_source`,
  `thesis_course_captured_at`,
  `source`,
  `captured_at`,
  `created_at`,
  `updated_at`
)
SELECT
  UUID(),
  `student`.`user_id`,
  `academic_year`.`id`,
  NULL,
  NULL,
  `student`.`taking_thesis_course`,
  NULL,
  NULL,
  `student`.`thesis_course_enrollment_source`,
  `student`.`thesis_course_enrollment_updated_at`,
  `student`.`thesis_course_enrollment_source`,
  `student`.`thesis_course_enrollment_updated_at`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `students` AS `student`
JOIN `academic_years` AS `academic_year`
  ON `student`.`thesis_course_enrollment_updated_at`
    BETWEEN `academic_year`.`start_date` AND `academic_year`.`end_date`
WHERE `student`.`taking_thesis_course` IS NOT NULL
  AND `student`.`thesis_course_enrollment_source` IS NOT NULL
  AND `student`.`thesis_course_enrollment_updated_at` IS NOT NULL
ON DUPLICATE KEY UPDATE
  `taking_thesis_course` =
    COALESCE(
      `student_academic_year_snapshots`.`taking_thesis_course`,
      VALUES(`taking_thesis_course`)
    ),
  `thesis_course_source` =
    COALESCE(
      `student_academic_year_snapshots`.`thesis_course_source`,
      VALUES(`thesis_course_source`)
    ),
  `thesis_course_captured_at` =
    COALESCE(
      `student_academic_year_snapshots`.`thesis_course_captured_at`,
      VALUES(`thesis_course_captured_at`)
    );
