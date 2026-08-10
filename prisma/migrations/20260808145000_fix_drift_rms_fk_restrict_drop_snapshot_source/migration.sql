-- Fix drift live DB vs schema (audit 2026-08-08):
-- 1) research_method_scores.thesis_id FK masih ON DELETE CASCADE di live DB;
--    schema menuntut RESTRICT (BR-21 / canon §5.7.2: jejak nilai TA-03 tidak
--    boleh ikut terhapus saat thesis dihapus).
-- 2) Kolom residu student_academic_year_snapshots.source (tidak ada di schema,
--    tidak dibaca kode mana pun; sisa seri migrasi 20260731).
-- 3) Rename FK snapshot ke nama konvensi schema (onDelete tetap RESTRICT).

-- DropForeignKey
ALTER TABLE `research_method_scores` DROP FOREIGN KEY `research_method_scores_thesis_id_fkey`;

-- DropForeignKey
ALTER TABLE `student_academic_year_snapshots` DROP FOREIGN KEY `student_ay_snapshots_period_id_fkey`;

-- DropForeignKey
ALTER TABLE `student_academic_year_snapshots` DROP FOREIGN KEY `student_ay_snapshots_student_id_fkey`;

-- AlterTable
ALTER TABLE `student_academic_year_snapshots` DROP COLUMN `source`;

-- AddForeignKey
ALTER TABLE `student_academic_year_snapshots` ADD CONSTRAINT `student_academic_year_snapshots_student_id_fkey` FOREIGN KEY (`student_id`) REFERENCES `students`(`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_academic_year_snapshots` ADD CONSTRAINT `student_academic_year_snapshots_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `research_method_scores` ADD CONSTRAINT `research_method_scores_thesis_id_fkey` FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
