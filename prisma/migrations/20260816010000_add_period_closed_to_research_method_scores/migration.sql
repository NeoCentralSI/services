-- AlterTable
ALTER TABLE `research_method_scores`
  ADD COLUMN `period_closed_at` DATETIME(3) NULL,
  ADD COLUMN `period_closed_reason` VARCHAR(64) NULL;

-- CreateIndex
CREATE INDEX `research_method_scores_period_closed_at_idx` ON `research_method_scores`(`period_closed_at`);
