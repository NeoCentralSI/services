-- Add is_proposal to thesis (Prisma schema expects it; used to filter proposal vs full thesis).
-- Default true for backward compatibility (existing rows treated as proposal phase until approved).

ALTER TABLE `thesis`
  ADD COLUMN `is_proposal` TINYINT(1) NOT NULL DEFAULT 1;
