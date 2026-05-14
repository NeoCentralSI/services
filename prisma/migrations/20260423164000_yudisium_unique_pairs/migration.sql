ALTER TABLE `yudisium_participants`
  ADD CONSTRAINT `yudisium_participants_thesis_id_yudisium_id_key`
  UNIQUE (`thesis_id`, `yudisium_id`);

ALTER TABLE `student_exit_survey_responses`
  ADD CONSTRAINT `student_exit_survey_responses_yudisium_id_thesis_id_key`
  UNIQUE (`yudisium_id`, `thesis_id`);
