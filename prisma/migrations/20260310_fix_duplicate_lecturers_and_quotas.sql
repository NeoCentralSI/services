-- =============================================================================
-- Migration: Fix Duplicate Lecturers & Recalculate Supervision Quotas
-- Date: 2026-03-10
-- 
-- Problems solved:
--   1. Dummy seed accounts created duplicate lecturers for real dosen.
--      Supervision records (thesis_supervisors, thesis_guidances, metopen_classes)
--      are attached to the dummy accounts while quota records sit on the SIA
--      accounts. This migration transfers all supervision-related records from
--      dummy → SIA accounts.
--   2. currentCount in lecturer_supervision_quotas is a static seed value that
--      has drifted from reality. This migration recalculates it from actual
--      thesis_supervisors records.
--
-- Dummy → SIA mapping (same real person):
--   Husnil Kamil:
--     dummy id = '1c9f963e-bda5-4ac1-8854-8d36efdc43ea'  (NIP 198201182008121002)
--     SIA   id = '54d06618-67c7-4e2f-85f0-83d832edcd3d'  (NIP 198501012010011001)
--   Ricky Akbar:
--     dummy id = '0d92a02a-c9da-4f7b-a171-40bef0e971ef'  (NIP 198410062012121001)
--     SIA   id = '0e67f110-2396-4c23-8fd4-d5044ebbde2e'  (NIP 198712152012011002)
--   Afriyanti Dwi Kartika:
--     dummy id = '7db4fc9d-b084-445c-acd6-bafc95bcf6e3'  (NIP 198904212019032024)
--     SIA   id = '877e77c3-0363-4fed-a022-d28937729b0b'  (NIP 199003052015042001)
-- =============================================================================

-- ─── Step 1: Transfer thesis_supervisors from dummy → SIA ───────────────────

UPDATE thesis_supervisors
SET lecturer_id = '54d06618-67c7-4e2f-85f0-83d832edcd3d'
WHERE lecturer_id = '1c9f963e-bda5-4ac1-8854-8d36efdc43ea';

UPDATE thesis_supervisors
SET lecturer_id = '0e67f110-2396-4c23-8fd4-d5044ebbde2e'
WHERE lecturer_id = '0d92a02a-c9da-4f7b-a171-40bef0e971ef';

UPDATE thesis_supervisors
SET lecturer_id = '877e77c3-0363-4fed-a022-d28937729b0b'
WHERE lecturer_id = '7db4fc9d-b084-445c-acd6-bafc95bcf6e3';

-- ─── Step 2: Transfer thesis_guidances from dummy → SIA ─────────────────────

UPDATE thesis_guidances
SET supervisor_id = '54d06618-67c7-4e2f-85f0-83d832edcd3d'
WHERE supervisor_id = '1c9f963e-bda5-4ac1-8854-8d36efdc43ea';

UPDATE thesis_guidances
SET supervisor_id = '0e67f110-2396-4c23-8fd4-d5044ebbde2e'
WHERE supervisor_id = '0d92a02a-c9da-4f7b-a171-40bef0e971ef';

UPDATE thesis_guidances
SET supervisor_id = '877e77c3-0363-4fed-a022-d28937729b0b'
WHERE supervisor_id = '7db4fc9d-b084-445c-acd6-bafc95bcf6e3';

-- ─── Step 3: Transfer metopen_classes from dummy → SIA ──────────────────────

UPDATE metopen_classes
SET lecturer_id = '54d06618-67c7-4e2f-85f0-83d832edcd3d'
WHERE lecturer_id = '1c9f963e-bda5-4ac1-8854-8d36efdc43ea';

UPDATE metopen_classes
SET lecturer_id = '0e67f110-2396-4c23-8fd4-d5044ebbde2e'
WHERE lecturer_id = '0d92a02a-c9da-4f7b-a171-40bef0e971ef';

UPDATE metopen_classes
SET lecturer_id = '877e77c3-0363-4fed-a022-d28937729b0b'
WHERE lecturer_id = '7db4fc9d-b084-445c-acd6-bafc95bcf6e3';

-- ─── Step 4: Transfer advisor_requests (target) from dummy → SIA ────────────

UPDATE thesis_advisor_request
SET lecturer_id = '54d06618-67c7-4e2f-85f0-83d832edcd3d'
WHERE lecturer_id = '1c9f963e-bda5-4ac1-8854-8d36efdc43ea';

UPDATE thesis_advisor_request
SET lecturer_id = '0e67f110-2396-4c23-8fd4-d5044ebbde2e'
WHERE lecturer_id = '0d92a02a-c9da-4f7b-a171-40bef0e971ef';

UPDATE thesis_advisor_request
SET lecturer_id = '877e77c3-0363-4fed-a022-d28937729b0b'
WHERE lecturer_id = '7db4fc9d-b084-445c-acd6-bafc95bcf6e3';

-- ─── Step 5: Transfer advisor_requests (redirect target) from dummy → SIA ───

UPDATE thesis_advisor_request
SET redirected_to = '54d06618-67c7-4e2f-85f0-83d832edcd3d'
WHERE redirected_to = '1c9f963e-bda5-4ac1-8854-8d36efdc43ea';

UPDATE thesis_advisor_request
SET redirected_to = '0e67f110-2396-4c23-8fd4-d5044ebbde2e'
WHERE redirected_to = '0d92a02a-c9da-4f7b-a171-40bef0e971ef';

UPDATE thesis_advisor_request
SET redirected_to = '877e77c3-0363-4fed-a022-d28937729b0b'
WHERE redirected_to = '7db4fc9d-b084-445c-acd6-bafc95bcf6e3';

-- ─── Step 6: Remove orphaned dummy quota records ────────────────────────────

DELETE FROM lecturer_supervision_quotas
WHERE lecturer_id IN (
  '1c9f963e-bda5-4ac1-8854-8d36efdc43ea',
  '0d92a02a-c9da-4f7b-a171-40bef0e971ef',
  '7db4fc9d-b084-445c-acd6-bafc95bcf6e3'
);

-- ─── Step 7: Recalculate currentCount for ALL lecturers from actual data ────
-- Count active thesis_supervisors (excluding thesis with status Selesai/Gagal)

UPDATE lecturer_supervision_quotas lsq
JOIN (
  SELECT
    ts.lecturer_id,
    COUNT(DISTINCT ts.id) AS real_count
  FROM thesis_supervisors ts
  JOIN thesis t ON ts.thesis_id = t.id
  LEFT JOIN thesis_status tst ON t.thesis_status_id = tst.id
  WHERE tst.name IS NULL OR tst.name NOT IN ('Selesai', 'Gagal')
  GROUP BY ts.lecturer_id
) counts ON lsq.lecturer_id = counts.lecturer_id
SET lsq.current_count = counts.real_count
WHERE lsq.current_count != counts.real_count;

-- Also reset to 0 any lecturers who have no active supervisors at all
UPDATE lecturer_supervision_quotas lsq
LEFT JOIN (
  SELECT
    ts.lecturer_id,
    COUNT(DISTINCT ts.id) AS real_count
  FROM thesis_supervisors ts
  JOIN thesis t ON ts.thesis_id = t.id
  LEFT JOIN thesis_status tst ON t.thesis_status_id = tst.id
  WHERE tst.name IS NULL OR tst.name NOT IN ('Selesai', 'Gagal')
  GROUP BY ts.lecturer_id
) counts ON lsq.lecturer_id = counts.lecturer_id
SET lsq.current_count = 0
WHERE counts.real_count IS NULL AND lsq.current_count != 0;

-- ─── Step 8: Reset quotaMax to sensible defaults (was set to 3 by test seed) ─
-- Per PRD, default quota should be 10 with soft limit 8

UPDATE lecturer_supervision_quotas SET quota_max = 10, quota_soft_limit = 8;

UPDATE supervision_quota_defaults SET quota_max = 10, quota_soft_limit = 8;
