-- AlterTable
ALTER TABLE `students` ADD COLUMN `taking_thesis_course` BOOLEAN NULL,
    ADD COLUMN `thesis_course_enrollment_source` ENUM('sia', 'devtools') NULL,
    ADD COLUMN `thesis_course_enrollment_updated_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `thesis` ADD COLUMN `final_proposal_version_id` VARCHAR(255) NULL;

-- CreateTable
CREATE TABLE `thesis_proposal_versions` (
    `id` VARCHAR(255) NOT NULL,
    `thesis_id` VARCHAR(255) NOT NULL,
    `document_id` VARCHAR(255) NOT NULL,
    `version` INTEGER NOT NULL,
    `description` TEXT NULL,
    `is_latest` BOOLEAN NOT NULL DEFAULT true,
    `submitted_as_final_at` DATETIME(3) NULL,
    `submitted_as_final_by_user_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_proposal_versions_document_id_idx`(`document_id`),
    INDEX `thesis_proposal_versions_thesis_id_is_latest_idx`(`thesis_id`, `is_latest`),
    INDEX `thesis_proposal_versions_submitted_as_final_at_idx`(`submitted_as_final_at`),
    INDEX `thesis_proposal_versions_submitted_as_final_by_user_id_idx`(`submitted_as_final_by_user_id`),
    UNIQUE INDEX `thesis_proposal_versions_thesis_id_version_key`(`thesis_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `thesis_final_proposal_version_id_fkey` ON `thesis`(`final_proposal_version_id`);

-- AddForeignKey
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_final_proposal_version_id_fkey` FOREIGN KEY (`final_proposal_version_id`) REFERENCES `thesis_proposal_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_versions` ADD CONSTRAINT `thesis_proposal_versions_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_versions` ADD CONSTRAINT `thesis_proposal_versions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_proposal_versions` ADD CONSTRAINT `thesis_proposal_versions_submitted_as_final_by_user_id_fkey` FOREIGN KEY (`submitted_as_final_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

