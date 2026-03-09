import { z } from "zod/v4";

export const resolveMetopenDuplicateEnrollmentSchema = z.object({
	academicYearId: z.string().uuid("academicYearId tidak valid"),
	studentId: z.string().uuid("studentId tidak valid"),
	keepClassId: z.string().uuid("keepClassId tidak valid"),
});
