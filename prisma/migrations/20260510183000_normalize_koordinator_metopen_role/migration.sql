-- Normalize legacy Metopen lecturer role names into the canonical
-- Koordinator Matkul Metopen role (canon SIMPTA §5.7).
-- Covers both historical labels seen in seed/migrations:
-- - Dosen Metodologi Penelitian
-- - Dosen Pengampu Metopel

INSERT INTO `user_roles` (`id`, `name`)
SELECT 'Koordinator Matkul Metopen', 'Koordinator Matkul Metopen'
WHERE NOT EXISTS (
  SELECT 1 FROM `user_roles` WHERE `id` = 'Koordinator Matkul Metopen'
);

INSERT IGNORE INTO `user_has_roles` (`user_id`, `role_id`, `status`)
SELECT `user_id`, 'Koordinator Matkul Metopen', `status`
FROM `user_has_roles`
WHERE `role_id` IN ('Dosen Metodologi Penelitian', 'Dosen Pengampu Metopel');

DELETE FROM `user_has_roles`
WHERE `role_id` IN ('Dosen Metodologi Penelitian', 'Dosen Pengampu Metopel');

DELETE FROM `user_roles`
WHERE `id` IN ('Dosen Metodologi Penelitian', 'Dosen Pengampu Metopel');

UPDATE `user_roles`
SET `name` = 'Koordinator Matkul Metopen'
WHERE `id` = 'Koordinator Matkul Metopen'
   OR `name` IN ('Dosen Metodologi Penelitian', 'Dosen Pengampu Metopel');
