-- Verify Migration A applied correctly
SELECT 
  COUNT(*) AS total_rows,
  SUM(CASE WHEN forwarded_to_kadep_at IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_forwarded_at,
  SUM(CASE WHEN forwarded_by_lecturer_id IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_forwarded_by,
  SUM(CASE WHEN accepted_over_normal = TRUE THEN 1 ELSE 0 END) AS rows_overquota_sah,
  SUM(CASE WHEN lecturer_overquota_reason IS NOT NULL AND forwarded_to_kadep_at IS NULL THEN 1 ELSE 0 END) AS unbackfilled_path_c
FROM thesis_advisor_request;
