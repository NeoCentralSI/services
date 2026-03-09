-- ================================================
-- Schema Optimization Migration Script (Fixed)
-- ================================================

-- Step 1: Add new proposal columns to thesis table
ALTER TABLE `thesis` ADD COLUMN IF NOT EXISTS `proposal_document_id` VARCHAR(191) NULL;
ALTER TABLE `thesis` ADD COLUMN IF NOT EXISTS `proposal_status` ENUM('submitted', 'reviewed', 'approved', 'rejected') NULL;

-- Step 2: Migrate proposal data from thesis_proposal -> thesis
UPDATE `thesis` t
INNER JOIN `thesis_proposal` tp ON t.thesis_proposal_id = tp.id
SET 
    t.proposal_document_id = tp.document_id,
    t.proposal_status = tp.status;

-- Step 3: Add index (use unique name to avoid conflict)
CREATE INDEX `thesis_proposal_doc_id_fkey` ON `thesis` (`proposal_document_id`);

-- Step 4: Add FK constraint (use unique name)
ALTER TABLE `thesis` ADD CONSTRAINT `thesis_proposal_doc_id_fkey` 
    FOREIGN KEY (`proposal_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
