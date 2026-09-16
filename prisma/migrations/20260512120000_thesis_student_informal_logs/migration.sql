-- CreateTable
CREATE TABLE `thesis_student_informal_logs` (
    `id` VARCHAR(191) NOT NULL,
    `thesis_id` VARCHAR(191) NOT NULL,
    `student_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `thesis_student_informal_logs_thesis_id_fkey`(`thesis_id`),
    INDEX `thesis_student_informal_logs_student_id_fkey`(`student_id`),
    INDEX `thesis_student_informal_logs_document_id_fkey`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `thesis_student_informal_logs` ADD CONSTRAINT `thesis_student_informal_logs_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_student_informal_logs` ADD CONSTRAINT `thesis_student_informal_logs_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thesis_student_informal_logs` ADD CONSTRAINT `thesis_student_informal_logs_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
