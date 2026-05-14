-- AlterTable
ALTER TABLE `research_method_score_details` ADD COLUMN `assessment_rubric_id` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `research_method_score_details_rubric_id_fkey` ON `research_method_score_details`(`assessment_rubric_id`);

-- AddForeignKey
ALTER TABLE `research_method_score_details` ADD CONSTRAINT `research_method_score_details_rubric_id_fkey` FOREIGN KEY (`assessment_rubric_id`) REFERENCES `assessment_rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
