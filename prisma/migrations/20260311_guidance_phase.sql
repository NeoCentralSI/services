-- Add phase column to thesis_guidances to differentiate proposal vs thesis guidance
ALTER TABLE `thesis_guidances`
  ADD COLUMN `phase` ENUM('proposal', 'thesis') NOT NULL DEFAULT 'proposal' AFTER `status`;
