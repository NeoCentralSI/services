-- Migration: align runtime-critical schema fields with `schema.prisma`.
--
-- Konteks:
--   `npx prisma migrate status` melaporkan "Database schema is up to date" karena
--   semua row di `_prisma_migrations` cocok dengan filesystem, TAPI `prisma migrate
--   diff --from-schema-datasource ... --to-schema-datamodel ...` mengungkap drift
--   besar (~25 KB SQL). Drift ini muncul karena baseline DB awalnya di-init lewat
--   legacy `.sql` file di root `prisma/migrations/`, bukan via Prisma migrate.
--
--   Migration ini sengaja MINIMAL — hanya menambah field/tabel yang diperlukan
--   oleh service layer aktif SIMPTA (terutama upload presensi Metopel yang
--   sebelumnya 500 karena `documents.file_hash` tidak ada). Drift terhadap modul
--   internship lama, thesis_proposal grade, exit survey session, dll DIBIARKAN
--   untuk dirapikan terpisah (di luar scope SIMPTA aktif).
--
-- Pola: idempotent menggunakan information_schema guards (MySQL <8.0.29 tidak
-- punya ALTER TABLE … IF NOT EXISTS).

SET @schema_name := DATABASE();

-- ============================================================
-- AlterTable: documents.file_hash
--   Service `metopenAttendance.service.js#persistAttendanceFile` menulis
--   `fileHash: sha256(...)` ke document. Tanpa kolom ini, insert document
--   melempar "Unknown column 'file_hash' in field list" → endpoint
--   `POST /assessment/metopen/attendance/upload` 500 Internal Server Error.
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'documents'
    AND COLUMN_NAME = 'file_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `documents` ADD COLUMN `file_hash` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- AlterTable: research_method_score_details — declare assessment_rubric_id FK
--   Service `assessment.service.js#submitSupervisorScore` menulis `rubricId`
--   yang di Prisma client di-map ke field relation `assessmentRubric` (FK
--   `assessment_rubric_id`). Migration `20260503100000_add_research_method_score_detail_rubric`
--   sudah membuat kolom + FK lama, lalu schema mengganti referensi target tabel
--   lama (`assessment_rubrics_*`) ke `assessment_rubrics`. Pastikan FK akhir
--   menunjuk ke tabel yang masih ada agar Prisma client tidak mismatch.
-- ============================================================
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_score_details'
    AND COLUMN_NAME = 'assessment_rubric_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `research_method_score_details` ADD COLUMN `assessment_rubric_id` VARCHAR(255) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop FK lama (jika menunjuk ke `rubric_id` lama) lalu add FK ke
-- `assessment_rubric_id` → `assessment_rubrics(id)`. Idempotent.
SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_score_details'
    AND CONSTRAINT_NAME = 'research_method_score_details_rubric_id_fkey'
);
SET @sql := IF(
  @fk_exists > 0,
  'ALTER TABLE `research_method_score_details` DROP FOREIGN KEY `research_method_score_details_rubric_id_fkey`',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'research_method_score_details'
    AND CONSTRAINT_NAME = 'research_method_score_details_assessment_rubric_id_fkey'
);
SET @sql := IF(
  @fk_exists = 0,
  'ALTER TABLE `research_method_score_details` ADD CONSTRAINT `research_method_score_details_assessment_rubric_id_fkey` FOREIGN KEY (`assessment_rubric_id`) REFERENCES `assessment_rubrics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
