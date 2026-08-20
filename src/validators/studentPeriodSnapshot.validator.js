import { z } from "zod";

/**
 * Backfill snapshot periode.
 * - `apply` default `false` supaya pemanggilan tanpa body bersifat dry-run dan
 *   tidak pernah menulis ke database.
 * - `includeThesisCourse` default `false` karena status KRS Tugas Akhir adalah
 *   input lifecycle promosi/pelepasan booking; membawa nilai periode lama hanya
 *   boleh dilakukan atas permintaan eksplisit operator.
 */
export const backfillPeriodSnapshotsSchema = z.object({
  academicYearId: z.string().min(1).optional(),
  apply: z.boolean().optional().default(false),
  includeThesisCourse: z.boolean().optional().default(false),
});
