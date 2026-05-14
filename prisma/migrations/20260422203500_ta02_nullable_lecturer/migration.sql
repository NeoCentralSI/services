-- TA-02 official path allows submission without a preselected lecturer.
-- The department reviews the topic first and assigns a supervisor later.
ALTER TABLE `thesis_advisor_request`
  MODIFY COLUMN `lecturer_id` VARCHAR(255) NULL;
