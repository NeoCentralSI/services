-- Historical seminar archives may not have reliable assignment provenance.
ALTER TABLE `thesis_seminar_examiners`
  MODIFY `assigned_by` VARCHAR(255) NULL;
