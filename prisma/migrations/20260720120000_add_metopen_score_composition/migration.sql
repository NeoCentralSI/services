-- CreateTable
CREATE TABLE `metopen_score_compositions` (
    `id` VARCHAR(191) NOT NULL,
    `academic_year_id` VARCHAR(191) NOT NULL,
    `ta03a_cap` INTEGER NOT NULL DEFAULT 75,
    `ta03b_cap` INTEGER NOT NULL DEFAULT 25,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `metopen_score_compositions_academic_year_id_key`(`academic_year_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `metopen_score_compositions` ADD CONSTRAINT `metopen_score_compositions_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill default 75:25 for every existing academic year
INSERT INTO `metopen_score_compositions` (`id`, `academic_year_id`, `ta03a_cap`, `ta03b_cap`, `created_at`, `updated_at`)
SELECT UUID(), `id`, 75, 25, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `academic_years`;
