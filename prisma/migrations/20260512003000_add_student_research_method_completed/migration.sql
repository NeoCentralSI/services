ALTER TABLE `students`
  ADD COLUMN IF NOT EXISTS `research_method_completed` BOOLEAN NOT NULL DEFAULT false AFTER `kkn_completed`;
