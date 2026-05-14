-- TA-05: bukti pendukung, pembimbing yang diganti (co-advisor), tier persetujuan lama→baru

ALTER TABLE `thesis_change_requests`
    ADD COLUMN `supporting_document_id` VARCHAR(191) NULL,
    ADD COLUMN `replaced_supervisor_lecturer_id` VARCHAR(191) NULL;

ALTER TABLE `thesis_change_request_approvals`
    ADD COLUMN `approval_tier` INTEGER NOT NULL DEFAULT 1;

CREATE INDEX `thesis_change_requests_supporting_document_id_fkey` ON `thesis_change_requests`(`supporting_document_id`);
CREATE INDEX `thesis_change_requests_replaced_supervisor_lecturer_id_fkey` ON `thesis_change_requests`(`replaced_supervisor_lecturer_id`);
CREATE INDEX `thesis_change_request_approvals_request_id_approval_tier_idx` ON `thesis_change_request_approvals`(`request_id`, `approval_tier`);

ALTER TABLE `thesis_change_requests`
    ADD CONSTRAINT `thesis_change_requests_supporting_document_id_fkey`
    FOREIGN KEY (`supporting_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `thesis_change_requests`
    ADD CONSTRAINT `thesis_change_requests_replaced_supervisor_lecturer_id_fkey`
    FOREIGN KEY (`replaced_supervisor_lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;
