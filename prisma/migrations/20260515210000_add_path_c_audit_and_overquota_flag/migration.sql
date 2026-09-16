-- Migration A: Path C audit fields + Overquota Sah flag
-- Resolves: P0-01 (forwardedToKadepAt + forwardedByLecturerId), P0-02 (acceptedOverNormal)
-- Canon ref: §5.2.1, §7.3, BR-26, BR-06
-- Source handoff: HANDOFF_SCHEMA_SIMPTA_REVISI.md §6.1
--
-- Idempotent pattern dengan prepared statement guard (NOTE: MySQL <8.0.29 tidak
-- punya ALTER TABLE … IF NOT EXISTS) supaya rerun aman setelah partial-apply.

SET @schema_name := DATABASE();

-- ============================================================
-- AlterTable: forwarded_to_kadep_at
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'thesis_advisor_request'
    AND COLUMN_NAME = 'forwarded_to_kadep_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `thesis_advisor_request` ADD COLUMN `forwarded_to_kadep_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- AlterTable: forwarded_by_lecturer_id
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'thesis_advisor_request'
    AND COLUMN_NAME = 'forwarded_by_lecturer_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `thesis_advisor_request` ADD COLUMN `forwarded_by_lecturer_id` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- AlterTable: accepted_over_normal
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'thesis_advisor_request'
    AND COLUMN_NAME = 'accepted_over_normal'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `thesis_advisor_request` ADD COLUMN `accepted_over_normal` BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- CreateIndex: forwarded_by_lecturer_id
-- ============================================================
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'thesis_advisor_request'
    AND INDEX_NAME = 'thesis_advisor_request_forwarded_by_lecturer_id_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `thesis_advisor_request_forwarded_by_lecturer_id_idx` ON `thesis_advisor_request`(`forwarded_by_lecturer_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- AddForeignKey: forwarded_by_lecturer_id → lecturers(user_id)
-- NOTE: Kolom PK fisik di tabel `lecturers` adalah `user_id`. Pattern sama
-- dengan FK lain seperti supervisor_id_fkey & lecturer_id_fkey.
-- ============================================================
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'thesis_advisor_request'
    AND CONSTRAINT_NAME = 'thesis_advisor_request_forwarded_by_lecturer_id_fkey'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `thesis_advisor_request` ADD CONSTRAINT `thesis_advisor_request_forwarded_by_lecturer_id_fkey` FOREIGN KEY (`forwarded_by_lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- BACKFILL DATA
-- ============================================================

-- P0-01 backfill: Path C escalated yang sudah forward → set audit fields.
-- Heuristik: rows dengan route_type='escalated' + lecturer_overquota_reason filled
-- + status indicating sudah forward (atau hasil downstream) → backfill dari
-- lecturer_responded_at + lecturer_id (yang accept overquota).
-- Guard: hanya update rows yang field-nya masih NULL (idempotent).
UPDATE `thesis_advisor_request`
SET `forwarded_to_kadep_at` = `lecturer_responded_at`,
    `forwarded_by_lecturer_id` = `lecturer_id`
WHERE `route_type` = 'escalated'
  AND `lecturer_overquota_reason` IS NOT NULL
  AND `lecturer_responded_at` IS NOT NULL
  AND `forwarded_to_kadep_at` IS NULL
  AND `status` IN ('pending_kadep', 'booking_approved', 'override_approved', 'rejected_by_kadep', 'redirected', 'active_official');

-- P0-02 backfill: Path C accepted overquota → set acceptedOverNormal flag.
-- Heuristik: rows dengan status='override_approved' ATAU (route_type='escalated'
-- + status='booking_approved' + lecturer_overquota_reason filled).
-- Guard: hanya update rows yang flag-nya masih FALSE (default), tidak berdampak
-- pada rows yang sudah TRUE.
UPDATE `thesis_advisor_request`
SET `accepted_over_normal` = TRUE
WHERE `accepted_over_normal` = FALSE
  AND (
    `status` = 'override_approved'
    OR (
      `status` = 'booking_approved'
      AND `route_type` = 'escalated'
      AND `lecturer_overquota_reason` IS NOT NULL
    )
  );
