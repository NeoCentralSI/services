-- Enforce SIMPTA supervisor integrity at database level.
--
-- Preflight requirement:
--   Run `npm run integrity:audit-supervisors` and repair reported duplicates
--   before applying this migration. The unique indexes below intentionally fail
--   if duplicate role names or duplicate active supervisor roles still exist.

CREATE TEMPORARY TABLE `_simpta_preflight_duplicate_user_roles` AS
SELECT `name`, COUNT(*) AS `duplicate_count`
FROM `user_roles`
GROUP BY `name`
HAVING COUNT(*) > 1;

ALTER TABLE `_simpta_preflight_duplicate_user_roles`
  ADD CONSTRAINT `_simpta_abort_duplicate_user_roles`
  CHECK (`duplicate_count` = 0);

CREATE TEMPORARY TABLE `_simpta_preflight_duplicate_active_supervisors` AS
SELECT `thesis_id`, `role_id`, COUNT(*) AS `duplicate_count`
FROM `thesis_participants`
WHERE `status` = 'active'
GROUP BY `thesis_id`, `role_id`
HAVING COUNT(*) > 1;

ALTER TABLE `_simpta_preflight_duplicate_active_supervisors`
  ADD CONSTRAINT `_simpta_abort_duplicate_active_supervisors`
  CHECK (`duplicate_count` = 0);

ALTER TABLE `user_roles`
  ADD UNIQUE INDEX `user_roles_name_key` (`name`);

ALTER TABLE `thesis_participants`
  DROP INDEX `thesis_participants_thesis_id_lecturer_id_key`;

ALTER TABLE `thesis_participants`
  ADD COLUMN `active_role_key` VARCHAR(191)
    GENERATED ALWAYS AS (CASE WHEN `status` = 'active' THEN `role_id` ELSE NULL END) STORED,
  ADD COLUMN `active_lecturer_key` VARCHAR(191)
    GENERATED ALWAYS AS (CASE WHEN `status` = 'active' THEN `lecturer_id` ELSE NULL END) STORED;

CREATE UNIQUE INDEX `thesis_participants_one_active_role_per_thesis_key`
  ON `thesis_participants` (`thesis_id`, `active_role_key`);

CREATE UNIQUE INDEX `thesis_participants_one_active_lecturer_per_thesis_key`
  ON `thesis_participants` (`thesis_id`, `active_lecturer_key`);

CREATE INDEX `thesis_participants_thesis_lecturer_status_idx`
  ON `thesis_participants` (`thesis_id`, `lecturer_id`, `status`);

CREATE INDEX `thesis_participants_thesis_role_status_idx`
  ON `thesis_participants` (`thesis_id`, `role_id`, `status`);
