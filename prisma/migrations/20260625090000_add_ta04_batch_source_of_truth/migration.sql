-- CreateTable
CREATE TABLE `ta04_batches` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(32) NOT NULL DEFAULT 'current',
    `cohort_hash` VARCHAR(64) NOT NULL,
    `generated_by_user_id` VARCHAR(191) NULL,
    `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ta04_batches_academic_year_id_version_key`(`academic_year_id`, `version`),
    INDEX `ta04_batches_academic_year_id_status_idx`(`academic_year_id`, `status`),
    INDEX `ta04_batches_document_id_idx`(`document_id`),
    INDEX `ta04_batches_generated_by_user_id_idx`(`generated_by_user_id`),
    INDEX `ta04_batches_cohort_hash_idx`(`cohort_hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ta04_batch_members` (
    `id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `student_name` VARCHAR(191) NOT NULL,
    `student_nim` VARCHAR(50) NOT NULL,
    `title` TEXT NOT NULL,
    `supervisor_names` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ta04_batch_members_batch_id_thesis_id_key`(`batch_id`, `thesis_id`),
    INDEX `ta04_batch_members_thesis_id_idx`(`thesis_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ta04_batches` ADD CONSTRAINT `ta04_batches_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batches` ADD CONSTRAINT `ta04_batches_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batches` ADD CONSTRAINT `ta04_batches_generated_by_user_id_fkey` FOREIGN KEY (`generated_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batch_members` ADD CONSTRAINT `ta04_batch_members_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `ta04_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ta04_batch_members` ADD CONSTRAINT `ta04_batch_members_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
