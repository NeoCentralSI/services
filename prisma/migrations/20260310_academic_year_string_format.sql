-- Academic year: convert year from INT to VARCHAR in format "2024/2025".
-- Fixes Prisma error "expected String, found 2025" and aligns with format 2024/2025 ganjil/genap.

SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Add new column
ALTER TABLE `academic_years`
  ADD COLUMN `year_new` VARCHAR(20) NULL AFTER `semester`;

-- 2. Backfill: INT year 2024 -> "2024/2025", 2025 -> "2025/2026"
UPDATE `academic_years`
SET `year_new` = CONCAT(CAST(`year` AS CHAR), '/', CAST(`year` + 1 AS CHAR))
WHERE `year` IS NOT NULL;

-- 3. Drop old INT column
ALTER TABLE `academic_years`
  DROP COLUMN `year`;

-- 4. Rename new column to year
ALTER TABLE `academic_years`
  CHANGE COLUMN `year_new` `year` VARCHAR(20) NULL DEFAULT NULL;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
