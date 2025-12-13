-- Add Outlook Calendar sync fields to thesis_guidances table
ALTER TABLE `thesis_guidances` 
ADD COLUMN `student_calendar_event_id` VARCHAR(255) NULL,
ADD COLUMN `supervisor_calendar_event_id` VARCHAR(255) NULL;
