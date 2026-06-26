import { z } from "zod";

export const academicYearQuerySchema = z.object({
  academicYear: z.string().min(1).optional(),
});

export function parseAcademicYearQuery(query) {
  return academicYearQuerySchema.parse(query ?? {});
}
