-- Finalize the two remaining DB-vs-datamodel drift items after baseline sync.

ALTER TABLE `internship_supervisor_letters`
  MODIFY `updated_at` DATETIME(3) NOT NULL;

ALTER TABLE `thesis_participants`
  ADD CONSTRAINT `thesis_participants_thesis_id_fkey`
  FOREIGN KEY (`thesis_id`) REFERENCES `thesis`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
