-- Align CPL ownership and code requirements with schema.md.
-- This migration intentionally fails if legacy orphaned/incomplete CPL rows exist,
-- so those records can be reviewed instead of being deleted implicitly.
ALTER TABLE `cpls`
    DROP FOREIGN KEY `cpls_curriculum_id_fkey`;

ALTER TABLE `cpls`
    MODIFY `curriculum_id` VARCHAR(255) NOT NULL,
    MODIFY `code` VARCHAR(255) NOT NULL;

ALTER TABLE `cpls`
    ADD CONSTRAINT `cpls_curriculum_id_fkey`
    FOREIGN KEY (`curriculum_id`) REFERENCES `curriculums`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
