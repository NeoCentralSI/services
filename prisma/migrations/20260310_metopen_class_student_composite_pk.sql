-- Enforce: satu mahasiswa hanya satu kelas Metopen per tahun ajaran.
-- Composite PK (student_id, academic_year_id) menggantikan (class_id, student_id).

SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Hapus duplikat: pertahankan row dengan enrolled_at paling awal per (student_id, academic_year_id)
DELETE m1 FROM `metopen_class_students` m1
INNER JOIN `metopen_class_students` m2
  ON m1.student_id = m2.student_id
  AND m1.academic_year_id = m2.academic_year_id
  AND m1.enrolled_at > m2.enrolled_at;

-- 2. Hapus PK lama
ALTER TABLE `metopen_class_students`
  DROP PRIMARY KEY;

-- 3. Set PK baru (student_id, academic_year_id)
ALTER TABLE `metopen_class_students`
  ADD PRIMARY KEY (`student_id`, `academic_year_id`);

-- 4. Index untuk lookup by class_id (relasi MetopenClass -> enrollments)
CREATE INDEX `metopen_class_students_class_id_idx` ON `metopen_class_students` (`class_id`);

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;
