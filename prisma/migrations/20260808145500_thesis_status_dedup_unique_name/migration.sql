-- Cleanup thesis_status (audit 2026-08-08):
-- 9 baris lookup legacy ganda memakai id = name (bukan uuid) dan tidak
-- direferensikan satu pun baris thesis. Baris-baris ini menduplikasi nama
-- status yang sudah ada versi uuid-nya (yang dipakai data aktual).
-- Guard ganda: hanya hapus baris dengan id = name AND tanpa referensi thesis.
DELETE ts FROM `thesis_status` ts
LEFT JOIN `thesis` t ON t.`thesis_status_id` = ts.`id`
WHERE ts.`id` = ts.`name` AND t.`id` IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX `thesis_status_name_key` ON `thesis_status`(`name`);
