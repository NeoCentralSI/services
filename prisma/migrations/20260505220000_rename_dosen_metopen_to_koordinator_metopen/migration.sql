-- Rename role 'Dosen Metodologi Penelitian' menjadi 'Koordinator Matkul Metopen'
-- Konteks: KONTEKS_KANONIS_SIMPTA.md §5.7 — TA-03B diisi oleh 1 orang/role
-- (Koordinator) walaupun dosen pengampu di lapangan bisa lebih dari 1.
-- Idempotent: safe to re-run; no-op jika role sudah pakai nama baru.

UPDATE `user_roles`
SET `name` = 'Koordinator Matkul Metopen'
WHERE `name` = 'Dosen Metodologi Penelitian';
