-- Phase 5: TA-05 broaden (supervisor/both), co-advisor, TA-17
-- 1. ThesisChangeRequest: add newSupervisorId for supervisor/both types
-- 2. ThesisSupervisors: add status for terminated (TA-17)
-- 3. ThesisGuidanceEvaluation: new model for TA-17 evaluasi berkala

-- 1. Add new_supervisor_id to thesis_change_requests
ALTER TABLE thesis_change_requests ADD COLUMN new_supervisor_id VARCHAR(36) NULL;
ALTER TABLE thesis_change_requests ADD CONSTRAINT fk_change_request_new_supervisor
  FOREIGN KEY (new_supervisor_id) REFERENCES lecturers(id) ON DELETE SET NULL;

-- 2. Add status to thesis_supervisors (active | terminated)
ALTER TABLE thesis_supervisors ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active';

-- 3. Create thesis_guidance_evaluations for TA-17
CREATE TABLE IF NOT EXISTS thesis_guidance_evaluations (
  id VARCHAR(36) PRIMARY KEY,
  thesis_id VARCHAR(36) NOT NULL,
  thesis_supervisor_id VARCHAR(36) NOT NULL,
  evaluation_type VARCHAR(20) NOT NULL,
  recommendation VARCHAR(50) NOT NULL,
  notes TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  kadep_approved_by VARCHAR(36) NULL,
  kadep_approved_at DATETIME(3) NULL,
  kadep_notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_eval_thesis FOREIGN KEY (thesis_id) REFERENCES thesis(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_supervisor FOREIGN KEY (thesis_supervisor_id) REFERENCES thesis_supervisors(id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_kadep FOREIGN KEY (kadep_approved_by) REFERENCES users(id) ON DELETE SET NULL
);
