-- Migration B: Status enum consolidation + AdvisorRequestRoute add dept
-- Resolves: P0-03 (status legacy values consolidation), P0-04 (route_type add 'dept')
-- Canon ref: §5.2, BR-22, BR-24
-- Source handoff: HANDOFF_SCHEMA_SIMPTA_REVISI.md §6.2
--
-- Strategi: idempotent — ALTER ENUM MySQL non-destruktif kalau enum value
-- sudah ada. UPDATE backfill pakai filter WHERE supaya rerun safe.
--
-- CATATAN: tabel thesis_advisor_request_status enum di MySQL TIDAK diubah pada
-- migration ini. Legacy values (closed, escalated, approved, rejected,
-- override_approved, assigned) DIPERTAHANKAN di schema enum untuk backward
-- compat read historical rows. Service layer baru WAJIB pakai canonical states
-- only (lihat schema.prisma @deprecated tags).

SET @schema_name := DATABASE();

-- ============================================================
-- ALTER ENUM: route_type — add 'dept' (Path A TA-02)
-- ============================================================
-- Idempotent: MySQL ENUM yang sudah punya value 'dept' tidak akan error.
ALTER TABLE `thesis_advisor_request`
  MODIFY COLUMN `route_type` ENUM('normal', 'escalated', 'dept') NOT NULL DEFAULT 'normal';

-- ============================================================
-- BACKFILL: route_type='dept' untuk TA-02 (Path A)
-- ============================================================
-- Idempotent via filter route_type != 'dept' (rerun no-op).
UPDATE `thesis_advisor_request`
SET `route_type` = 'dept'
WHERE `request_type` = 'ta_02'
  AND `route_type` != 'dept';

-- ============================================================
-- BACKFILL: Status legacy → canonical (idempotent)
-- ============================================================

-- approved, override_approved, assigned → booking_approved
-- (override_approved sudah punya acceptedOverNormal=true dari Migration A)
UPDATE `thesis_advisor_request`
SET `status` = 'booking_approved'
WHERE `status` IN ('approved', 'override_approved', 'assigned');

-- rejected → differentiate dosen vs kadep berdasarkan reviewer's role
-- Step 1: mark sebagai rejected_by_kadep jika reviewer punya role KETUA_DEPARTEMEN
UPDATE `thesis_advisor_request` tar
INNER JOIN `users` u ON tar.`reviewed_by` = u.id
INNER JOIN `user_has_roles` uhr ON u.id = uhr.user_id
INNER JOIN `user_roles` ur ON uhr.role_id = ur.id
SET tar.`status` = 'rejected_by_kadep'
WHERE tar.`status` = 'rejected'
  AND ur.name = 'KETUA_DEPARTEMEN';

-- Step 2: sisa 'rejected' → rejected_by_dosen (fallback default)
UPDATE `thesis_advisor_request`
SET `status` = 'rejected_by_dosen'
WHERE `status` = 'rejected';

-- closed → canceled (semantik sama: request ditutup final)
UPDATE `thesis_advisor_request`
SET `status` = 'canceled'
WHERE `status` = 'closed';

-- escalated → pending_kadep (escalated semantik = pending KaDep untuk Path C)
UPDATE `thesis_advisor_request`
SET `status` = 'pending_kadep'
WHERE `status` = 'escalated';
