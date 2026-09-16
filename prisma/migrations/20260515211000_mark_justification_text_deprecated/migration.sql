-- Migration C: Justification field cleanup (deprecate justificationText)
-- Resolves: P0-05 (dual-field justification drift)
-- Canon ref: §5.2.1, BR-26
-- Source handoff: HANDOFF_SCHEMA_SIMPTA_REVISI.md §6.3
--
-- Strategi Tahap 1 (non-breaking): backfill data dari justification_text ke
-- student_justification untuk rows yang missing canonical field. Field legacy
-- justification_text DIPERTAHANKAN di schema dengan @deprecated tag untuk
-- backward compat. Tahap 2 (iterasi berikutnya) baru DROP kolom setelah audit
-- memastikan tidak ada read sisa.

-- ============================================================
-- BACKFILL: copy justification_text → student_justification
-- ============================================================

-- thesis_advisor_request: copy untuk rows yang student_justification masih NULL
-- Idempotent via filter (student_justification IS NULL).
UPDATE `thesis_advisor_request`
SET `student_justification` = `justification_text`
WHERE `student_justification` IS NULL
  AND `justification_text` IS NOT NULL;

-- thesis_advisor_request_draft: copy untuk drafts yang student_justification masih NULL
UPDATE `thesis_advisor_request_draft`
SET `student_justification` = `justification_text`
WHERE `student_justification` IS NULL
  AND `justification_text` IS NOT NULL;
