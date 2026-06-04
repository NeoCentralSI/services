-- Migration F: Extend GuidanceStatus enum (rescheduled, summary_rejected)
-- Resolves: P1-10 (canon §5.5 logbook lifecycle missing transitions)
-- Source handoff: HANDOFF_SCHEMA_SIMPTA_REVISI.md §6.6
--
-- Note: ThesisParticipant.seminarReady & defenceReady tagging adalah comment-only
-- (sudah di-update di schema.prisma) — tidak butuh SQL DDL.

-- ============================================================
-- ALTER ENUM: GuidanceStatus — add 'rescheduled', 'summary_rejected'
-- ============================================================
-- Idempotent: MySQL ENUM yang sudah punya value baru tidak akan error.
-- Default 'requested' tetap. Ordering ENUM mengikuti urutan lifecycle natural.
ALTER TABLE `thesis_guidances`
  MODIFY COLUMN `status` ENUM(
    'requested',
    'accepted',
    'rescheduled',
    'rejected',
    'summary_pending',
    'summary_rejected',
    'completed',
    'cancelled',
    'deleted'
  ) NOT NULL DEFAULT 'requested';
