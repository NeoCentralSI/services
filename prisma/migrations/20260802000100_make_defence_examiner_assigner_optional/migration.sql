-- Historical defence archives may not have reliable assignment provenance.
ALTER TABLE `thesis_defence_examiners`
  MODIFY `assigned_by` VARCHAR(255) NULL;
