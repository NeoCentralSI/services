-- BR-20 (canon §5.7.1, audit Q1+OQ-1a 2026-05-10):
-- Tambah field co-sign Pembimbing 2 pada research_method_scores.
-- P1 = master pengisi rubrik (supervisor_id + supervisor_score sudah ada),
-- P2 = co-sign (kolom baru di bawah). Sumber bertanda tangan tunggal di
-- formulir cetak TA-03A → nilai konsensus, bukan agregasi.
--
-- Idempotent dengan guard prepared statement supaya rerun aman setelah
-- partial-apply (NOTE: MySQL <8.0.29 tidak punya ALTER TABLE … IF NOT EXISTS).

SET @schema_name := DATABASE();

-- AlterTable: co_signed_by_lecturer_id
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_scores'
    AND COLUMN_NAME = 'co_signed_by_lecturer_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `research_method_scores` ADD COLUMN `co_signed_by_lecturer_id` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AlterTable: co_signed_at
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_scores'
    AND COLUMN_NAME = 'co_signed_at'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `research_method_scores` ADD COLUMN `co_signed_at` DATETIME(3) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AlterTable: co_sign_note
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_scores'
    AND COLUMN_NAME = 'co_sign_note'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `research_method_scores` ADD COLUMN `co_sign_note` TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- CreateIndex (guard agar idempotent juga)
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_scores'
    AND INDEX_NAME = 'research_method_scores_co_signed_by_lecturer_id_idx'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX `research_method_scores_co_signed_by_lecturer_id_idx` ON `research_method_scores`(`co_signed_by_lecturer_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AddForeignKey
-- NOTE: kolom PK fisik di tabel `lecturers` adalah `user_id` (lihat schema.prisma:
-- model Lecturer { id String @id @map("user_id") }). Existing FK seperti
-- supervisor_id_fkey & lecturer_id_fkey juga merujuk `lecturers(user_id)`.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_scores'
    AND CONSTRAINT_NAME = 'research_method_scores_co_signed_by_lecturer_id_fkey'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_co_signed_by_lecturer_id_fkey` FOREIGN KEY (`co_signed_by_lecturer_id`) REFERENCES `lecturers`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
