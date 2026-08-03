-- Keep all SIA-derived eligibility inputs used by period-sensitive SIMPTA
-- workflows immutable within the first successful snapshot of a period.
ALTER TABLE `student_academic_year_snapshots`
  ADD COLUMN `eligible_metopen` BOOLEAN NOT NULL,
  ADD COLUMN `research_method_completed` BOOLEAN NOT NULL;
