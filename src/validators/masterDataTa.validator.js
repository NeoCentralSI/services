import { z } from "zod";

export const createThesisSchema = z.object({
    studentId: z.string().uuid(),
    title: z.string().nullable().optional(),
    thesisTopicId: z.string().uuid().nullable().optional(),
    pembimbing1: z.string().uuid(),
    pembimbing2: z.string().uuid().nullable().optional(),
});

export const updateThesisSchema = z.object({
    title: z.string().nullable().optional(),
    thesisTopicId: z.string().uuid().nullable().optional(),
    academicYearId: z.string().uuid().nullable().optional(),
    startDate: z.string().datetime({ offset: true }).nullable().optional().or(z.date().nullable().optional()),
    rating: z.enum(["ONGOING", "SLOW", "AT_RISK", "FAILED", "CANCELLED"]).optional(),
    supervisors: z.array(
        z.object({
            lecturerId: z.string(),
            roleId: z.string()
        })
    ).optional()
});
