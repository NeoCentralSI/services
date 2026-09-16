-- Dual-class Metopel attendance upload: store source file metadata on the
-- single active MetopenAttendanceImport (1–2 xlsx merged by NIM).
ALTER TABLE `metopen_attendance_imports`
  ADD COLUMN `source_files` JSON NULL;
