-- Audit trail for KaDep title approval (FR-KDP-05). Safe to run once; if columns exist, skip or adjust manually.

ALTER TABLE `thesis` ADD COLUMN `proposal_review_notes` TEXT NULL;
ALTER TABLE `thesis` ADD COLUMN `proposal_reviewed_at` DATETIME(3) NULL;
ALTER TABLE `thesis` ADD COLUMN `proposal_reviewed_by_user_id` VARCHAR(255) NULL;

-- InnoDB creates supporting index for the FK; @@index in Prisma matches this name.
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_proposal_reviewed_by_user_id_fkey` FOREIGN KEY (`proposal_reviewed_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
