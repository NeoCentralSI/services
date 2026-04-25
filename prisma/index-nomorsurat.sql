ALTER TABLE internship_proposals 
ADD CONSTRAINT check_letter_numbers_not_equal 
CHECK (app_letter_doc_number IS NULL OR assign_letter_doc_number IS NULL OR app_letter_doc_number <> assign_letter_doc_number);