-- Add room metadata used by master-data room management and scheduling UIs.
-- Nullable to preserve existing room rows.

ALTER TABLE `rooms` ADD COLUMN `location` VARCHAR(255) NULL;
ALTER TABLE `rooms` ADD COLUMN `capacity` INTEGER NULL;
